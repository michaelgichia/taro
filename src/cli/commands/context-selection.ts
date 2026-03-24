import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

import pc from "picocolors";

import { toImportPath } from "#cli/commands/generate-paths.ts";
import type { RepoContextMatch } from "#cli/commands/generate-runtime-types.ts";
import type { MockAnalysis } from "#core/mock-intelligence.ts";
import { readTaroOverrides, resolveTaroPackageProfile } from "#core/state.ts";
import { loadOrBootstrapTaroState } from "#core/state.ts";
import type { JsSuitePlan } from "#core/suite-planner.ts";
import type {
  AnalyzedRecording,
  NormalizedRecording,
  VisualState,
} from "#types/recording.ts";
import type {
  RepoRenderTargetCandidate,
  ResolvedTaroPackageProfile,
} from "#types/state.ts";

function log(msg: string): void {
  process.stderr.write(msg + "\n");
}

const PAGE_CONFIRMED_CONTEXT_TERM_BONUS = 50;
const CONTEXT_SEARCH_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".taro",
  "coverage",
  ".next",
  ".nuxt",
]);
const CONTEXT_SEARCH_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const GENERIC_CONTEXT_TERMS = new Set([
  "add",
  "back",
  "cancel",
  "close",
  "continue",
  "done",
  "next",
  "open",
  "save",
  "submit",
]);

function looksLikeSelectorLikeString(value: string): boolean {
  return (
    /^[#.[]/.test(value) ||
    /^[a-z][a-z0-9-]*(?:[.#[:>])/i.test(value) ||
    /^(button|input|select|textarea|a|img|h[1-6])$/i.test(value)
  );
}

function normalizeContextTerm(value?: string): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (
    !normalized ||
    normalized.length < 4 ||
    looksLikeSelectorLikeString(normalized)
  ) {
    return null;
  }

  const lower = normalized.toLowerCase();
  if (!/\s/.test(normalized) && GENERIC_CONTEXT_TERMS.has(lower)) {
    return null;
  }

  return normalized;
}

function scoreContextTerm(term: string): number {
  let score = term.length;
  if (/\s/.test(term)) {
    score += 10;
  }
  if (/[()/:+-]/.test(term)) {
    score += 4;
  }
  if (/\d/.test(term)) {
    score += 2;
  }

  return score;
}

export function collectVisualElementContextTerm(
  visualState: VisualState
): string | null {
  const candidates = [
    visualState.element?.ariaLabel,
    visualState.element?.labelText,
    visualState.element?.innerText,
    visualState.element?.altText,
    visualState.element?.title,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeContextTerm(candidate ?? undefined);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function collectPageConfirmedContextTerms(
  visualState: VisualState | null
): string[] {
  if (!visualState) {
    return [];
  }

  const terms = new Set<string>();
  const register = (value?: string | null) => {
    const normalized = normalizeContextTerm(value ?? undefined);
    if (normalized) {
      terms.add(normalized);
    }
  };

  for (const landmark of visualState.matchedLandmarks ?? []) {
    register(landmark);
  }

  if (
    visualState.status === "auth-interrupted" ||
    visualState.status === "auth-recovery-failed" ||
    visualState.status === "auth-recovery-timed-out"
  ) {
    return [...terms];
  }

  register(visualState.dialog?.title);
  for (const action of visualState.dialog?.actions ?? []) {
    register(action);
  }
  register(collectVisualElementContextTerm(visualState));

  return [...terms];
}

export function summarizePageConfirmedContext(
  visualState: VisualState | null
): void {
  const confirmedTerms = collectPageConfirmedContextTerms(visualState);
  if (confirmedTerms.length === 0) {
    return;
  }

  log(
    pc.dim("[taro]") +
      ` Page-confirmed context: ${confirmedTerms.slice(0, 3).join(" | ")}`
  );
}

export function collectRepoContextSearchTerms(
  recording: NormalizedRecording,
  visualState: VisualState | null = null
): string[] {
  const termScores = new Map<string, number>();

  const registerTerm = (value?: string, bonus = 0) => {
    const term = normalizeContextTerm(value);
    if (!term) {
      return;
    }

    termScores.set(
      term,
      (termScores.get(term) ?? 0) + scoreContextTerm(term) + bonus
    );
  };

  for (const confirmedTerm of collectPageConfirmedContextTerms(visualState)) {
    registerTerm(confirmedTerm, PAGE_CONFIRMED_CONTEXT_TERM_BONUS);
  }

  registerTerm(recording.title);
  for (const step of recording.steps) {
    registerTerm(step.target);
    registerTerm(step.value);
  }

  return [...termScores.entries()]
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
    )
    .map(([term]) => term)
    .slice(0, 8);
}

function normalizeComparablePath(value: string): string {
  return value.replace(/^\/private(?=\/var\/)/u, "");
}

export async function findRepoContextMatches(params: {
  projectRoot: string;
  terms: string[];
  excludePaths: string[];
}): Promise<RepoContextMatch[]> {
  const { projectRoot, terms, excludePaths } = params;
  if (terms.length === 0) {
    return [];
  }

  const normalizedTerms = terms.map((term) => ({
    raw: term,
    lower: term.toLowerCase(),
    weight: scoreContextTerm(term),
  }));
  const comparableProjectRoot = normalizeComparablePath(resolve(projectRoot));
  const excluded = new Set(
    excludePaths.map((value) => normalizeComparablePath(resolve(value)))
  );
  const excludedRelativePaths = new Set(
    excludePaths
      .map((value) =>
        relative(
          comparableProjectRoot,
          normalizeComparablePath(resolve(value))
        ).replace(/\\/g, "/")
      )
      .filter((value) => value && !value.startsWith(".."))
  );
  const matches: RepoContextMatch[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!CONTEXT_SEARCH_SKIP_DIRS.has(entry.name)) {
          await walk(fullPath);
        }
        continue;
      }

      if (
        !entry.isFile() ||
        !CONTEXT_SEARCH_EXTENSIONS.has(extname(entry.name))
      ) {
        continue;
      }

      const resolvedPath = normalizeComparablePath(resolve(fullPath));
      const relativePath = relative(
        comparableProjectRoot,
        resolvedPath
      ).replace(/\\/g, "/");
      if (
        excluded.has(resolvedPath) ||
        excludedRelativePaths.has(relativePath)
      ) {
        continue;
      }

      let content: string;
      try {
        content = await readFile(resolvedPath, "utf-8");
      } catch {
        continue;
      }

      if (content.length > 500_000) {
        continue;
      }

      const lowered = content.toLowerCase();
      const matchedTerms = normalizedTerms
        .filter((term) => lowered.includes(term.lower))
        .map((term) => term.raw);

      if (matchedTerms.length === 0) {
        continue;
      }

      const score = normalizedTerms
        .filter((term) => matchedTerms.includes(term.raw))
        .reduce((sum, term) => sum + term.weight, 0);

      matches.push({
        filePath: relativePath,
        matchedTerms,
        kind: /\.(test|spec)\.[jt]sx?$/u.test(entry.name) ? "test" : "source",
        score,
      });
    }
  }

  await walk(projectRoot);

  return matches
    .sort((left, right) => {
      return (
        right.score - left.score ||
        right.matchedTerms.length - left.matchedTerms.length ||
        left.filePath.localeCompare(right.filePath)
      );
    })
    .slice(0, 10);
}

export function formatContextMatchesSummary(
  matches: RepoContextMatch[]
): string {
  return matches
    .slice(0, 3)
    .map(
      (match) =>
        `${match.filePath} [${match.matchedTerms.slice(0, 2).join(", ")}]`
    )
    .join(" | ");
}

export function resolvePackageProfileFromContextMatches(params: {
  state: Awaited<ReturnType<typeof loadOrBootstrapTaroState>>["state"];
  currentProfile: ResolvedTaroPackageProfile | null;
  projectRoot: string;
  overrides: Awaited<ReturnType<typeof readTaroOverrides>>;
  matches: RepoContextMatch[];
}): { profile: ResolvedTaroPackageProfile | null; reason: string | null } {
  const { state, currentProfile, projectRoot, overrides, matches } = params;
  if (matches.length === 0) {
    return { profile: currentProfile, reason: null };
  }

  const scores = new Map<string, { score: number; filePath: string }>();
  const packagePaths = Object.keys(state.packages).sort(
    (left, right) => right.length - left.length
  );

  for (const match of matches) {
    const matchingPackagePath = packagePaths.find((packagePath) => {
      return (
        packagePath !== "." &&
        (match.filePath === packagePath ||
          match.filePath.startsWith(`${packagePath}/`))
      );
    });

    if (!matchingPackagePath) {
      continue;
    }

    const existing = scores.get(matchingPackagePath);
    if (existing) {
      existing.score += match.score;
      continue;
    }

    scores.set(matchingPackagePath, {
      score: match.score,
      filePath: match.filePath,
    });
  }

  const bestMatch = [...scores.entries()].sort(
    (left, right) =>
      right[1].score - left[1].score || left[0].localeCompare(right[0])
  )[0];

  if (!bestMatch) {
    return { profile: currentProfile, reason: null };
  }

  const [packagePath, info] = bestMatch;
  if (currentProfile?.packagePath === packagePath || info.score <= 0) {
    return { profile: currentProfile, reason: null };
  }

  const resolvedProfile = resolveTaroPackageProfile(
    state,
    projectRoot,
    join(projectRoot, packagePath, "__taro-context-match__.test.tsx"),
    overrides
  );

  if (!resolvedProfile) {
    return { profile: currentProfile, reason: null };
  }

  return {
    profile: resolvedProfile,
    reason: `${info.filePath} matched recording text evidence`,
  };
}

function isLikelyRenderTargetSymbol(symbol: string): boolean {
  return /^[A-Z][A-Za-z0-9_]*$/u.test(symbol);
}

export function deriveContextRenderTargets(params: {
  projectRoot: string;
  outputPath: string;
  matches: RepoContextMatch[];
}): RepoRenderTargetCandidate[] {
  const { projectRoot, outputPath, matches } = params;
  const candidates: RepoRenderTargetCandidate[] = [];
  const seen = new Set<string>();
  const outputDir = dirname(outputPath);

  for (const match of matches) {
    if (match.kind !== "source") {
      continue;
    }

    const absolutePath = join(projectRoot, match.filePath);
    const symbol = basename(match.filePath).replace(/\.[^.]+$/u, "");
    if (!isLikelyRenderTargetSymbol(symbol)) {
      continue;
    }

    const importPath = toImportPath(outputDir, absolutePath);
    const dedupeKey = `${symbol}|${importPath}`;
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    candidates.push({
      symbol,
      importPath,
      sourceTestFile: match.filePath,
      helperNames: [],
      usesWithin: false,
      evidenceTerms: match.matchedTerms,
    });
  }

  return candidates;
}

function tokenizeSuiteHint(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

export function scoreRenderTargetCandidate(
  candidate: RepoRenderTargetCandidate,
  recording: NormalizedRecording,
  mockAnalysis: MockAnalysis | null,
  suitePlan: JsSuitePlan,
  options: {
    packageProfile?: ResolvedTaroPackageProfile | null;
    visualState?: VisualState | null;
  } = {}
): number {
  const { packageProfile, visualState } = options;
  const recordingTokens = new Set([
    ...tokenizeSuiteHint(recording.title),
    ...recording.steps.flatMap((step) => tokenizeSuiteHint(step.target ?? "")),
  ]);
  const confirmedTokens = new Set(
    collectPageConfirmedContextTerms(visualState ?? null).flatMap((term) =>
      tokenizeSuiteHint(term)
    )
  );
  const candidateTokens = new Set([
    ...tokenizeSuiteHint(candidate.symbol),
    ...tokenizeSuiteHint(candidate.importPath),
    ...tokenizeSuiteHint(candidate.sourceTestFile),
    ...candidate.helperNames.flatMap((name) => tokenizeSuiteHint(name)),
    ...(candidate.evidenceTerms ?? []).flatMap((term) =>
      tokenizeSuiteHint(term)
    ),
  ]);

  let score = 0;
  for (const token of candidateTokens) {
    if (recordingTokens.has(token)) {
      score += 3;
    }
    if (confirmedTokens.has(token)) {
      score += 5;
    }
  }

  if (
    /Module$/u.test(candidate.symbol) &&
    suitePlan.renderBoundary.kind === "module"
  ) {
    score += 4;
  }

  if (candidate.usesWithin) {
    score += 1;
  }

  if (mockAnalysis?.repeatedTargets.length) {
    score += 1;
  }

  if (
    packageProfile?.packagePath &&
    packageProfile.packagePath !== "." &&
    (candidate.sourceTestFile === packageProfile.packagePath ||
      candidate.sourceTestFile.startsWith(`${packageProfile.packagePath}/`))
  ) {
    score += 8;
  }

  return score;
}

export function resolveRepoRenderTarget(params: {
  candidates: RepoRenderTargetCandidate[];
  packageProfile?: ResolvedTaroPackageProfile | null;
  recording: NormalizedRecording;
  mockAnalysis: MockAnalysis | null;
  suitePlan: JsSuitePlan;
  visualState?: VisualState | null;
}): RepoRenderTargetCandidate | null {
  const {
    candidates,
    packageProfile,
    recording,
    mockAnalysis,
    suitePlan,
    visualState,
  } = params;
  if (candidates.length === 0) {
    return null;
  }

  const ranked = candidates
    .map((candidate) => ({
      candidate,
      score: scoreRenderTargetCandidate(
        candidate,
        recording,
        mockAnalysis,
        suitePlan,
        { packageProfile, visualState }
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.candidate.symbol.localeCompare(right.candidate.symbol)
    );

  return ranked[0]?.candidate ?? null;
}

export function applyRepoRenderTarget(
  suitePlan: JsSuitePlan,
  renderTarget: RepoRenderTargetCandidate | null
): JsSuitePlan {
  if (!renderTarget) {
    return suitePlan;
  }

  return {
    ...suitePlan,
    renderBoundary: {
      ...suitePlan.renderBoundary,
      resolvedTarget: renderTarget.symbol,
      confidence:
        suitePlan.renderBoundary.confidence === "low"
          ? "medium"
          : suitePlan.renderBoundary.confidence,
    },
    warnings: suitePlan.warnings.filter(
      (warning) =>
        !warning.includes(
          "Taro could not resolve the exact render target from repo context"
        ) &&
        !warning.includes(
          "Prefer a repo-local module/container render boundary"
        )
    ),
  };
}

export function findRecordingUrl(
  analyzedRecording: AnalyzedRecording
): string | undefined {
  return (
    analyzedRecording.url ??
    analyzedRecording.steps.find((step) => step.action === "navigate")?.target
  );
}

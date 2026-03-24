import {
  type Finding,
  formatFindingsBlock,
  hasBlockingFindings,
} from "#core/findings-reporter.ts";

export function flushFindings(findings: Finding[]): never {
  if (findings.length > 0) {
    process.stdout.write(formatFindingsBlock(findings) + "\n");
  }
  process.exit(hasBlockingFindings(findings) ? 1 : 0);
}

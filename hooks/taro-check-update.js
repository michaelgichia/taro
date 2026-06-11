#!/usr/bin/env node

import { access } from "node:fs/promises";
import { join } from "node:path";

const PACKAGE_NAME = "@tr-rtl/cli";

const LOCKFILES = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lockb", "bun"],
  ["bun.lock", "bun"],
  ["deno.lock", "deno"],
  ["package-lock.json", "npm"],
  ["npm-shrinkwrap.json", "npm"],
];

const SUPPORTED = new Set(["npm", "pnpm", "yarn", "bun", "deno"]);

function dlx(pm) {
  switch (pm) {
    case "pnpm":
      return `pnpm dlx ${PACKAGE_NAME}@latest`;
    case "yarn":
      return `yarn dlx ${PACKAGE_NAME}@latest`;
    case "bun":
      return `bunx ${PACKAGE_NAME}@latest`;
    case "deno":
      return `deno run -A npm:${PACKAGE_NAME}@latest`;
    case "npm":
    default:
      return `npx ${PACKAGE_NAME}@latest`;
  }
}

function detectFromUserAgent() {
  const ua = process.env.npm_config_user_agent;
  if (!ua) return null;
  const token = ua.split(" ")[0]?.split("/")[0]?.toLowerCase();
  return token && SUPPORTED.has(token) ? token : null;
}

async function detectFromLockfile(cwd) {
  for (const [file, pm] of LOCKFILES) {
    try {
      await access(join(cwd, file));
      return pm;
    } catch {
      // continue
    }
  }
  return null;
}

const pm =
  detectFromUserAgent() ??
  (process.env.DENO_VERSION ? "deno" : null) ??
  (await detectFromLockfile(process.cwd())) ??
  "npm";

console.log(`Taro updates are installer-first. Refresh with \`${dlx(pm)}\`.`);

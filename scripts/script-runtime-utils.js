import { pathToFileURL } from "node:url";

export function runInstallOrExit(args, options) {
  const {
    spawnImpl,
    nodeBin,
    installEntrypoint,
    rootDir,
    env,
    exit = process.exit,
  } = options;
  const result = spawnImpl(nodeBin, [installEntrypoint, ...args], {
    cwd: rootDir,
    stdio: "inherit",
    env,
  });

  if (result.status !== 0) {
    exit(result.status ?? 1);
  }
}

export function shouldRunAsMain(
  argv1 = process.argv[1],
  moduleUrl = import.meta.url
) {
  return Boolean(argv1 && moduleUrl === pathToFileURL(argv1).href);
}

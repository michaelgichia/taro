const { execSync } = require("child_process");

function run(command, execImpl = execSync) {
  return execImpl(command, { encoding: "utf8" }).trim();
}

function tryRun(command, execImpl = execSync) {
  try {
    return run(command, execImpl);
  } catch {
    return "";
  }
}

function normalizeRepoUrl(url) {
  return url
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/^ssh:\/\/git@github\.com\//, "https://github.com/");
}

function detectRepoUrl(execImpl = execSync) {
  const originUrl =
    tryRun("git remote get-url origin", execImpl) ||
    tryRun("git config --get remote.origin.url", execImpl);
  if (originUrl) {
    return normalizeRepoUrl(originUrl);
  }

  throw new Error('Could not detect repository URL from git remote "origin".');
}

function parseArgs(argv) {
  const options = { from: "", to: "HEAD" };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--from") {
      options.from = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--to") {
      options.to = argv[index + 1] || "HEAD";
      index += 1;
    }
  }

  return options;
}

function findCurrentTag(execImpl = execSync) {
  const tags = tryRun("git tag --points-at HEAD", execImpl);
  if (!tags) {
    return "";
  }

  return (
    tags
      .split("\n")
      .map((tag) => tag.trim())
      .find(Boolean) || ""
  );
}

function determineRange(options, execImpl = execSync) {
  if (options.from) {
    return {
      from: options.from,
      to: options.to || "HEAD",
      heading:
        options.to && options.to !== "HEAD"
          ? `### Changes in ${options.to}\n`
          : `### Changes since ${options.from}\n`,
    };
  }

  const currentTag = findCurrentTag(execImpl);
  if (currentTag) {
    const previousTag = tryRun(
      "git describe --tags --abbrev=0 HEAD^",
      execImpl
    );
    if (!previousTag) {
      throw new Error(`Could not find a previous tag before ${currentTag}.`);
    }

    return {
      from: previousTag,
      to: currentTag,
      heading: `### Changes in ${currentTag}\n`,
    };
  }

  const lastTag = run("git describe --tags --abbrev=0", execImpl);
  return {
    from: lastTag,
    to: options.to || "HEAD",
    heading: `### Changes since ${lastTag}\n`,
  };
}

function getCommitBody(hash, execImpl = execSync) {
  return tryRun(`git show -s --format=%B ${hash}`, execImpl);
}

function extractPrNumber(subject) {
  const squashMatch = subject.match(/\(#(\d+)\)/);
  if (squashMatch) {
    return squashMatch[1];
  }

  const mergeMatch = subject.match(/^Merge pull request #(\d+)/i);
  if (mergeMatch) {
    return mergeMatch[1];
  }

  return null;
}

function getMergeCommitTitle(hash, subject, execImpl = execSync) {
  if (!/^Merge pull request #\d+/i.test(subject)) {
    return subject;
  }

  const body = getCommitBody(hash, execImpl);
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines[1] || subject;
}

function cleanSubject(hash, subject, execImpl = execSync) {
  return getMergeCommitTitle(hash, subject, execImpl).replace(
    /\s+\(#\d+\)$/,
    ""
  );
}

function generateChangelog(argv, options = {}) {
  const execImpl = options.execImpl ?? execSync;
  const log = options.log ?? console.log;
  const error = options.error ?? console.error;
  const exit = options.exit ?? process.exit;

  try {
    const parsedArgs = parseArgs(argv);
    const repoUrl = detectRepoUrl(execImpl);
    const range = determineRange(parsedArgs, execImpl);
    const commitsRaw = tryRun(
      `git log ${range.from}..${range.to} --pretty=format:"%h|%s"`,
      execImpl
    );

    if (!commitsRaw) {
      log(`No new changes found between ${range.from} and ${range.to}.`);
      exit(0);
      return;
    }

    const categorized = { Added: [], Fixed: [], Changed: [] };
    const seenEntries = new Set();
    const seenSubjects = new Set();

    for (const line of commitsRaw.split("\n")) {
      const separatorIndex = line.indexOf("|");
      if (separatorIndex === -1) {
        continue;
      }

      const hash = line.slice(0, separatorIndex);
      const subject = line.slice(separatorIndex + 1);
      const prNumber = extractPrNumber(subject);
      const prLink = prNumber
        ? ` [PR #${prNumber}](${repoUrl}/pull/${prNumber})`
        : "";
      const cleanedSubject = cleanSubject(hash, subject, execImpl);
      const entry = `- ${cleanedSubject} ([${hash}](${repoUrl}/commit/${hash}))${prLink}`;
      const lowerSubject = cleanedSubject.toLowerCase();
      const entryKey = prNumber ? `pr:${prNumber}` : `subject:${lowerSubject}`;

      if (seenEntries.has(entryKey) || seenSubjects.has(lowerSubject)) {
        continue;
      }

      seenEntries.add(entryKey);
      seenSubjects.add(lowerSubject);

      if (lowerSubject.startsWith("feat")) {
        categorized.Added.push(entry);
      } else if (lowerSubject.startsWith("fix")) {
        categorized.Fixed.push(entry);
      } else {
        categorized.Changed.push(entry);
      }
    }

    log(range.heading);

    for (const [category, items] of Object.entries(categorized)) {
      if (items.length === 0) {
        continue;
      }

      log(`#### ${category}`);
      for (const item of items) {
        log(item);
      }
      log("");
    }
  } catch (caughtError) {
    error(
      caughtError.message ||
        "Error generating changelog. Ensure you have at least one previous tag."
    );
    exit(1);
  }
}

module.exports = {
  cleanSubject,
  detectRepoUrl,
  determineRange,
  extractPrNumber,
  findCurrentTag,
  generateChangelog,
  getCommitBody,
  getMergeCommitTitle,
  normalizeRepoUrl,
  parseArgs,
  run,
  tryRun,
};

if (require.main === module) {
  generateChangelog(process.argv.slice(2));
}

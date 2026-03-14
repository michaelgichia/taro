const { execSync } = require("child_process");

function run(command) {
  return execSync(command, { encoding: "utf8" }).trim();
}

function tryRun(command) {
  try {
    return run(command);
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

function detectRepoUrl() {
  const originUrl =
    tryRun("git remote get-url origin") ||
    tryRun("git config --get remote.origin.url");
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

function findCurrentTag() {
  const tags = tryRun("git tag --points-at HEAD");
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

function determineRange(options) {
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

  const currentTag = findCurrentTag();
  if (currentTag) {
    const previousTag = tryRun("git describe --tags --abbrev=0 HEAD^");
    if (!previousTag) {
      throw new Error(`Could not find a previous tag before ${currentTag}.`);
    }

    return {
      from: previousTag,
      to: currentTag,
      heading: `### Changes in ${currentTag}\n`,
    };
  }

  const lastTag = run("git describe --tags --abbrev=0");
  return {
    from: lastTag,
    to: options.to || "HEAD",
    heading: `### Changes since ${lastTag}\n`,
  };
}

function getCommitBody(hash) {
  return tryRun(`git show -s --format=%B ${hash}`);
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

function getMergeCommitTitle(hash, subject) {
  if (!/^Merge pull request #\d+/i.test(subject)) {
    return subject;
  }

  const body = getCommitBody(hash);
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines[1] || subject;
}

function cleanSubject(hash, subject) {
  return getMergeCommitTitle(hash, subject).replace(/\s+\(#\d+\)$/, "");
}

try {
  const options = parseArgs(process.argv.slice(2));
  const repoUrl = detectRepoUrl();
  const range = determineRange(options);
  const commitsRaw = tryRun(
    `git log ${range.from}..${range.to} --pretty=format:"%h|%s"`
  );

  if (!commitsRaw) {
    console.log(`No new changes found between ${range.from} and ${range.to}.`);
    process.exit(0);
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
    const cleanedSubject = cleanSubject(hash, subject);
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

  console.log(range.heading);

  for (const [category, items] of Object.entries(categorized)) {
    if (items.length === 0) {
      continue;
    }

    console.log(`#### ${category}`);
    for (const item of items) {
      console.log(item);
    }
    console.log("");
  }
} catch (error) {
  console.error(
    error.message ||
      "Error generating changelog. Ensure you have at least one previous tag."
  );
  process.exit(1);
}

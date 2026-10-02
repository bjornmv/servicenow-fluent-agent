'use strict';

// Stage documentation and the reviewed worker only. Never execute/download Git.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const repoRoot = path.resolve(__dirname, '..');
const workerRelativePath = 'payload/.agents/skills/win-git-bootstrap/scripts/Ensure-MinGit254.ps1';
const downloadRelativePath = 'downloads/Ensure-MinGit254.ps1';

function validateBootstrapHash(sourceRoot = repoRoot) {
  const page = fs.readFileSync(path.join(sourceRoot, 'git-setup.md'), 'utf8');
  const matches = [...page.matchAll(/\$ExpectedBootstrapSha256\s*=\s*'([a-f\d]{64})'/gi)];
  if (matches.length !== 1) {
    throw new Error('git-setup.md must declare exactly one ExpectedBootstrapSha256.');
  }
  const worker = fs.readFileSync(path.join(sourceRoot, workerRelativePath));
  const actual = crypto.createHash('sha256').update(worker).digest('hex');
  if (actual !== matches[0][1].toLowerCase()) {
    throw new Error('Bootstrap worker SHA-256 mismatch: review the worker change and update git-setup.md before publishing.');
  }
  return actual;
}

function stageSetupPages(outputDirectory, sourceRoot = repoRoot) {
  const sha256 = validateBootstrapHash(sourceRoot);
  const files = [
    ['setup.md', 'setup.md'],
    ['git-setup.md', 'git-setup.md'],
    [workerRelativePath, downloadRelativePath],
  ];
  // Validate all inputs before writing. Copy bytes unchanged (including LF).
  const inputs = files.map(([source, destination]) => ({
    destination,
    bytes: fs.readFileSync(path.join(sourceRoot, source)),
  }));
  for (const { destination, bytes } of inputs) {
    const target = path.join(outputDirectory, destination);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  return { outputDirectory, files: inputs.map(({ destination }) => destination), bootstrapSha256: sha256 };
}

module.exports = { stageSetupPages, validateBootstrapHash, workerRelativePath, downloadRelativePath };

if (require.main === module) {
  try {
    const result = stageSetupPages(path.join(repoRoot, '_pages'));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

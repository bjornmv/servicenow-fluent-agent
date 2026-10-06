'use strict';

// Stage documentation and the reviewed worker only. Never execute/download Git.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const repoRoot = path.resolve(__dirname, '..');
const workerRelativePath = 'payload/.agents/skills/win-git-bootstrap/scripts/Ensure-MinGit254.ps1';
const downloadRelativePath = 'downloads/Ensure-MinGit254.ps1';
const sdkWorkerRelativePath = 'tools/Invoke-SdkSetup.ps1';
const sdkDownloadRelativePath = 'downloads/Invoke-SdkSetup.ps1';

function validateSdkSetupHash(sourceRoot = repoRoot) {
  const page = fs.readFileSync(path.join(sourceRoot, 'setup.md'), 'utf8');
  const matches = [...page.matchAll(/\$ExpectedSdkSetupSha256\s*=\s*'([a-f\d]{64})'/gi)];
  if (matches.length !== 1) throw new Error('setup.md must declare exactly one ExpectedSdkSetupSha256.');
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(sourceRoot, sdkWorkerRelativePath))).digest('hex');
  if (actual !== matches[0][1].toLowerCase()) throw new Error('SDK worker SHA-256 mismatch: review and update setup.md before publishing.');
  return actual;
}

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
  const sdkSha256 = validateSdkSetupHash(sourceRoot);
  const version = fs.readFileSync(path.join(sourceRoot, 'VERSION'), 'utf8').trim();
  const packageVersion = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf8')).version;
  const distributionVersion = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'manifest.json'), 'utf8')).version;
  const setup = fs.readFileSync(path.join(sourceRoot, 'setup.md'), 'utf8');
  const sdk = fs.readFileSync(path.join(sourceRoot, sdkWorkerRelativePath), 'utf8');
  if (!/^\d+\.\d+\.\d+$/.test(version) || version !== packageVersion || version !== distributionVersion ||
      setup.match(/^SETUP_PROTOCOL_VERSION=(.+)$/m)?.[1] !== version ||
      setup.match(/^SETUP_GUIDE_END=(.+)$/m)?.[1] !== version ||
      !setup.includes('Read https://bjornmv.github.io/servicenow-fluent-agent/setup/ and follow its instructions') ||
      !setup.includes('https://bjornmv.github.io/servicenow-fluent-agent/setup.txt') ||
      !setup.includes('https://bjornmv.github.io/servicenow-fluent-agent/downloads/Invoke-SdkSetup.ps1') ||
      !sdk.includes(`$WorkerVersion = '${version}'`)) {
    throw new Error('Setup release versions disagree: VERSION, package, manifest, guide markers/URLs and SDK worker must match.');
  }
  const releaseRoot = `releases/${version}`;
  const files = [
    ['setup.md', 'setup.md'],
    ['git-setup.md', 'git-setup.md'],
    [workerRelativePath, downloadRelativePath],
    [sdkWorkerRelativePath, sdkDownloadRelativePath],
  ];
  // Validate all inputs before writing. Copy bytes unchanged (including LF).
  const inputs = files.map(([source, destination]) => ({
    destination,
    bytes: fs.readFileSync(path.join(sourceRoot, source)),
  }));
  // Complete plain text is available at a stable URL, not an HTML redirect.
  // The matching manifest detects stale/mixed guide and worker content.
  const text = Buffer.from(setup.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''));
  const gitText = Buffer.from(fs.readFileSync(path.join(sourceRoot, 'git-setup.md'), 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''));
  const manifest = {
    version,
    setup: { file: 'setup.txt', sha256: crypto.createHash('sha256').update(text).digest('hex') },
    sdkWorker: { file: 'Invoke-SdkSetup.ps1', sha256: sdkSha256 },
    gitSetup: { file: 'git-setup.txt', sha256: crypto.createHash('sha256').update(gitText).digest('hex') },
    gitWorker: { file: 'Ensure-MinGit254.ps1', sha256 },
  };
  const currentManifest = {
    ...manifest,
    sdkWorker: { ...manifest.sdkWorker, file: sdkDownloadRelativePath },
    gitWorker: { ...manifest.gitWorker, file: downloadRelativePath },
  };
  inputs.push(
    { destination: 'setup.txt', bytes: text },
    { destination: 'git-setup.txt', bytes: gitText },
    { destination: 'setup-manifest.json', bytes: Buffer.from(JSON.stringify(currentManifest, null, 2) + '\n') },
    { destination: `${releaseRoot}/setup.txt`, bytes: text },
    { destination: `${releaseRoot}/Invoke-SdkSetup.ps1`, bytes: fs.readFileSync(path.join(sourceRoot, sdkWorkerRelativePath)) },
    { destination: `${releaseRoot}/git-setup.txt`, bytes: gitText },
    { destination: `${releaseRoot}/Ensure-MinGit254.ps1`, bytes: fs.readFileSync(path.join(sourceRoot, workerRelativePath)) },
    { destination: `${releaseRoot}/manifest.json`, bytes: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') },
  );
  for (const { destination, bytes } of inputs) {
    const target = path.join(outputDirectory, destination);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  return { outputDirectory, version, files: inputs.map(({ destination }) => destination), bootstrapSha256: sha256, sdkSetupSha256: sdkSha256 };
}

module.exports = { stageSetupPages, validateBootstrapHash, validateSdkSetupHash, workerRelativePath, downloadRelativePath, sdkWorkerRelativePath, sdkDownloadRelativePath };

if (require.main === module) {
  try {
    const result = stageSetupPages(path.join(repoRoot, '_pages'));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

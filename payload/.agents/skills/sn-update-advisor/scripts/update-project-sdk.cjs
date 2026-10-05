#!/usr/bin/env node
'use strict';
// Npm-only project update worker. Never invokes the SDK, a shell, Git, or authentication.
// Launch once after approval; status is read-only. A missing result is UNKNOWN, not a retry.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const { createHash } = require('node:crypto');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

const SDK = '@servicenow/sdk';
const LOCK = '.sn-sdk-update.lock';
const exactVersion = value => typeof value === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value);
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
function requireThat(condition, message) { if (!condition) throw new Error(message); }
function absolute(value, label) {
  requireThat(typeof value === 'string' && path.isAbsolute(value), `${label} must be absolute`);
  return path.resolve(value);
}
function regular(file) {
  const stat = fs.lstatSync(file);
  requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, `Not a regular unlinked file: ${file}`);
}
function physical(location) {
  requireThat(samePath(fs.realpathSync(location), path.resolve(location)), `Linked/junction path requires manual review: ${location}`);
}
function sdkState(project) {
  const pkg = json(path.join(project, 'package.json'));
  const lock = json(path.join(project, 'package-lock.json'));
  const fields = ['dependencies', 'devDependencies'].filter(field => typeof pkg[field]?.[SDK] === 'string');
  requireThat(fields.length === 1, 'SDK must be declared exactly once in dependencies or devDependencies');
  const section = fields[0];
  return { section, declared: pkg[section][SDK], lockDeclared: lock.packages?.['']?.[section]?.[SDK],
    locked: lock.packages?.[`node_modules/${SDK}`]?.version,
    installed: json(path.join(project, 'node_modules', SDK, 'package.json')).version };
}
function preflight(options) {
  const project = absolute(options.project, 'project');
  const runDir = absolute(options.runDir, 'run-dir');
  const npmCli = absolute(options.npmCli, 'npm-cli');
  requireThat(exactVersion(options.from) && exactVersion(options.to) && options.from !== options.to,
    'from/to must be different exact approved versions');
  physical(project);
  requireThat(!fs.existsSync(path.join(project, LOCK)), 'Existing update lock: inspect its original run; do not retry');
  requireThat(!fs.existsSync(runDir), 'Run directory already exists: use status, not another apply');
  let evidenceParent = path.dirname(runDir);
  while (!fs.existsSync(evidenceParent)) evidenceParent = path.dirname(evidenceParent);
  physical(evidenceParent);
  const relativeRun = path.relative(project, runDir);
  requireThat(relativeRun && (path.isAbsolute(relativeRun) || relativeRun === '..' || relativeRun.startsWith('..' + path.sep)), 'Keep run evidence outside the project');
  for (const file of ['package.json', 'package-lock.json', 'node_modules', `node_modules/${SDK}/package.json`]) {
    const target = path.join(project, file);
    physical(target);
    if (file !== 'node_modules') regular(target);
  }
  const pkg = json(path.join(project, 'package.json'));
  requireThat(!pkg.workspaces && (!pkg.packageManager || /^npm@/.test(pkg.packageManager)), 'Only standalone npm projects are supported');
  for (const file of ['npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb']) {
    requireThat(!fs.existsSync(path.join(project, file)), `Conflicting package-manager file: ${file}`);
  }
  // npm can discover a workspace above the supplied directory. Refuse it, even with --prefix.
  for (let parent = path.dirname(project); ; parent = path.dirname(parent)) {
    const file = path.join(parent, 'package.json');
    if (fs.existsSync(file)) requireThat(!json(file).workspaces, 'Ancestor npm workspace requires a separate reviewed workflow');
    if (path.dirname(parent) === parent) break;
  }
  const nvmrc = path.join(project, '.nvmrc');
  if (fs.existsSync(nvmrc)) {
    const version = fs.readFileSync(nvmrc, 'utf8').trim().replace(/^v/, '');
    requireThat(exactVersion(version) && version === process.versions.node,
      'Node does not match the exact .nvmrc pin; stop for environment review, never switch/install Node automatically');
  }
  regular(npmCli);
  requireThat(path.basename(npmCli) === 'npm-cli.js' && path.basename(path.dirname(npmCli)) === 'bin' &&
    json(path.join(path.dirname(npmCli), '..', 'package.json')).name === 'npm', 'Expected reviewed npm/bin/npm-cli.js');
  const npmVersion = json(path.join(path.dirname(npmCli), '..', 'package.json')).version;
  if (pkg.packageManager) requireThat(pkg.packageManager.split('+')[0] === `npm@${npmVersion}`, 'npm does not match the project packageManager pin');
  const before = sdkState(project);
  requireThat(['declared', 'lockDeclared', 'locked', 'installed'].every(key => before[key] === options.from),
    'Project declaration, lock and installed SDK must all match the exact approved from version');
  const args = [npmCli, '--prefix', project, 'install', '--global=false', '--workspaces=false', '--ignore-scripts',
    '--engine-strict', '--force=false', '--package-lock=true', '--package-lock-only=false', '--save=true', before.section === 'devDependencies' ? '--save-dev' : '--save-prod', '--save-exact', `${SDK}@${options.to}`];
  const hashes = Object.fromEntries(['package.json', 'package-lock.json'].map(file => [file, digest(fs.readFileSync(path.join(project, file)))]));
  return { project, runDir, npmCli, from: options.from, to: options.to, before, hashes, args };
}
function atomicJson(file, value) {
  const pending = file + '.pending';
  fs.writeFileSync(pending, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  fs.renameSync(pending, file);
}
function apply(options, run = spawnSync) {
  requireThat(options.approved === true, 'Explicit --approved is required after user approval and script/engine/Git review');
  const plan = preflight(options);
  const lockFile = path.join(plan.project, LOCK);
  // Exclusive per-project ownership is acquired before any package-manager launch.
  const owner = { project: plan.project, runDir: plan.runDir, from: plan.from, to: plan.to, section: plan.before.section, pid: process.pid };
  fs.writeFileSync(lockFile, JSON.stringify(owner, null, 2) + '\n', { flag: 'wx' });
  // Any interruption leaves this lock intact. Never infer death/completion from a PID or tool timeout.
  fs.mkdirSync(path.dirname(plan.runDir), { recursive: true });
  fs.mkdirSync(plan.runDir);
  atomicJson(path.join(plan.runDir, 'request.json'), { ...owner, node: process.version, executable: process.execPath, args: plan.args, startedAt: new Date().toISOString() });
  for (const file of ['package.json', 'package-lock.json']) {
    const bytes = fs.readFileSync(path.join(plan.project, file));
    requireThat(digest(bytes) === plan.hashes[file], `Concurrent change before launch: ${file}`);
    fs.writeFileSync(path.join(plan.runDir, file + '.before'), bytes, { flag: 'wx' });
  }
  const stdout = fs.openSync(path.join(plan.runDir, 'npm.stdout.log'), 'wx');
  const stderr = fs.openSync(path.join(plan.runDir, 'npm.stderr.log'), 'wx');
  let child;
  try {
    child = run(process.execPath, plan.args, { cwd: plan.project, shell: false, stdio: ['ignore', stdout, stderr] });
  } catch (error) { child = { error }; }
  finally { fs.closeSync(stdout); fs.closeSync(stderr); }
  const exitCode = Number.isInteger(child?.status) ? child.status : null;
  const result = { ...owner, completedAt: new Date().toISOString(), exitCode,
    signal: child?.signal || null, launchError: child?.error ? String(child.error.message) : null,
    state: 'unknown', build: 'not-run', stdout: 'npm.stdout.log', stderr: 'npm.stderr.log' };
  if (exitCode !== null && !result.signal && !result.launchError) {
    result.state = exitCode === 0 ? 'verification-failed' : 'failed';
    if (exitCode === 0) {
      try {
        result.after = sdkState(plan.project);
        const expected = json(path.join(plan.runDir, 'package.json.before'));
        expected[plan.before.section][SDK] = plan.to;
        requireThat(isDeepStrictEqual(json(path.join(plan.project, 'package.json')), expected), 'Unexpected manifest changes outside the approved SDK pin');
        if (['declared', 'lockDeclared', 'locked', 'installed'].every(key => result.after[key] === plan.to) && result.after.section === plan.before.section) {
          result.state = 'package-verified';
        }
      } catch (error) { result.verificationError = error.message; }
    }
  }
  atomicJson(path.join(plan.runDir, 'result.json'), result);
  // Failures/unknowns retain ownership for manual review, preventing blind duplicate runs.
  if (result.state === 'package-verified') {
    requireThat(isDeepStrictEqual(json(lockFile), owner), 'Update ownership changed; retain the lock for review');
    fs.unlinkSync(lockFile);
  }
  return result;
}
function status(runDirectory) {
  const runDir = absolute(runDirectory, 'run-dir');
  // No mkdir, registry request, process probe, unlock, install, or result rewriting in status mode.
  if (!fs.existsSync(path.join(runDir, 'request.json'))) return { state: 'unknown', runDir, reason: 'No request evidence; do not retry' };
  const request = json(path.join(runDir, 'request.json'));
  const file = path.join(runDir, 'result.json');
  if (!fs.existsSync(file)) return { state: 'unknown', runDir, reason: 'No completed result; read the original logs, do not retry' };
  const result = json(file);
  requireThat(request.runDir === runDir && result.runDir === runDir && result.project === request.project && result.from === request.from && result.to === request.to && result.section === request.section,
    'Mismatched run evidence; completion unknown');
  if (result.state === 'package-verified') {
    requireThat(result.exitCode === 0 && !result.signal && !result.launchError && result.build === 'not-run', 'Invalid success evidence');
    for (const log of ['npm.stdout.log', 'npm.stderr.log']) regular(path.join(runDir, log));
    const current = sdkState(request.project);
    const expected = json(path.join(runDir, 'package.json.before'));
    requireThat(['dependencies', 'devDependencies'].includes(request.section) && expected[request.section]?.[SDK] === request.from, 'Invalid original manifest evidence');
    expected[request.section][SDK] = request.to;
    if (current.section !== request.section || !isDeepStrictEqual(json(path.join(request.project, 'package.json')), expected) ||
        !['declared', 'lockDeclared', 'locked', 'installed'].every(key => current[key] === request.to)) {
      return { ...result, state: 'verification-failed', reason: 'Current project SDK no longer matches the completed run' };
    }
  }
  return result;
}
function parse(argv) {
  const mode = argv.shift();
  requireThat(['preflight', 'apply', 'status'].includes(mode), 'Use preflight, apply or status');
  const options = {};
  const keys = { '--project': 'project', '--from': 'from', '--to': 'to', '--npm-cli': 'npmCli', '--run-dir': 'runDir' };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--approved') { requireThat(!options.approved, 'Duplicate approval flag'); options.approved = true; continue; }
    requireThat(keys[flag] && !options[keys[flag]] && argv[i + 1] && !argv[i + 1].startsWith('--'), `Invalid or duplicate argument: ${flag}`);
    options[keys[flag]] = argv[++i];
  }
  if (mode === 'status') requireThat(Object.keys(options).length === 1 && options.runDir, 'status accepts only --run-dir');
  if (mode === 'preflight') requireThat(!options.approved, 'Approval belongs only to apply');
  return { mode, options };
}
if (require.main === module) {
  try {
    const { mode, options } = parse(process.argv.slice(2));
    const result = mode === 'apply' ? apply(options) : mode === 'status' ? status(options.runDir) : preflight(options);
    console.log(JSON.stringify(result, null, 2));
    if (mode !== 'preflight' && result.state !== 'package-verified') process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { preflight, apply, status, parse };

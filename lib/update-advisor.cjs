'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const CHECK_INTERVAL_MS = 48 * 60 * 60 * 1000;
const REMINDER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const STATE_VERSION = 1;

function statePathForHome(home = os.homedir()) {
  return path.join(home, '.agents', '.servicenow-fluent-agent-update.json');
}

function emptyState() {
  return { version: STATE_VERSION, components: {} };
}

function readState(statePath) {
  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (!state || typeof state !== 'object' || typeof state.components !== 'object') return emptyState();
    return { version: STATE_VERSION, components: state.components };
  } catch (error) {
    if (error && error.code === 'ENOENT') return emptyState();
    return emptyState();
  }
}

function writeState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const temporaryPath = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(state, null, 2) + '\n', 'utf8');
  fs.renameSync(temporaryPath, statePath);
}

function dateValue(value) {
  const milliseconds = Date.parse(value || '');
  return Number.isFinite(milliseconds) ? milliseconds : undefined;
}

function isDue(component, now, force) {
  if (force) return true;
  const snoozedUntil = dateValue(component.snoozedUntil);
  if (snoozedUntil !== undefined && snoozedUntil > now.getTime()) return false;
  const lastCheckedAt = dateValue(component.lastCheckedAt);
  return lastCheckedAt === undefined || now.getTime() - lastCheckedAt >= CHECK_INTERVAL_MS;
}

function isSameRelease(first, second) {
  return Boolean(first && second && first.id === second.id);
}

function mayNotify(component, now) {
  if (!component.available) return false;
  const snoozedUntil = dateValue(component.snoozedUntil);
  if (snoozedUntil !== undefined && snoozedUntil > now.getTime()) return false;
  if (isSameRelease(component.available, component.skippedRelease)) return false;
  const lastPromptedAt = dateValue(component.lastPromptedAt);
  return lastPromptedAt === undefined || now.getTime() - lastPromptedAt >= REMINDER_INTERVAL_MS;
}

function defaultRun(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function gitOutput(run, args, cwd) {
  return String(run('git', args, cwd)).trim();
}

function gitHead(run, cwd) {
  return gitOutput(run, ['rev-parse', 'HEAD'], cwd);
}

function remoteHead(run, cwd, branch) {
  const output = gitOutput(run, ['ls-remote', 'origin', `refs/heads/${branch}`], cwd);
  const match = /^([0-9a-f]{40})\s+/im.exec(output);
  return match ? match[1] : undefined;
}

function isCleanGitRepository(run, cwd) {
  return gitOutput(run, ['status', '--porcelain'], cwd) === '';
}

function shortRevision(value) {
  return value.slice(0, 12);
}

function agentRelease(options) {
  const localRevision = gitHead(options.run, options.repoRoot);
  const availableRevision = remoteHead(options.run, options.repoRoot, 'main');
  if (!availableRevision || availableRevision === localRevision) return undefined;
  if (!isCleanGitRepository(options.run, options.repoRoot)) return undefined;
  return {
    id: availableRevision,
    label: 'ServiceNow Fluent Agent',
    current: shortRevision(localRevision),
    available: shortRevision(availableRevision),
  };
}

function packageSdkVersion(projectPath) {
  const packagePath = path.join(projectPath, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const declared = (packageJson.devDependencies && packageJson.devDependencies['@servicenow/sdk']) ||
    (packageJson.dependencies && packageJson.dependencies['@servicenow/sdk']);
  if (typeof declared !== 'string') return undefined;
  const match = /^(?:[~^>=< ]*)?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/.exec(declared);
  if (!match) return undefined;
  return match[1];
}

function semverParts(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version || '');
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4],
  };
}

function isNewerVersion(available, current) {
  const availableParts = semverParts(available);
  const currentParts = semverParts(current);
  if (!availableParts || !currentParts) return false;
  for (const field of ['major', 'minor', 'patch']) {
    if (availableParts[field] !== currentParts[field]) return availableParts[field] > currentParts[field];
  }
  if (!availableParts.prerelease && currentParts.prerelease) return true;
  if (availableParts.prerelease && !currentParts.prerelease) return false;
  return Boolean(availableParts.prerelease && currentParts.prerelease && availableParts.prerelease > currentParts.prerelease);
}

async function defaultLatestSdkVersion() {
  if (typeof fetch !== 'function') throw new Error('Node fetch is unavailable');
  const response = await fetch('https://registry.npmjs.org/@servicenow%2fsdk/latest');
  if (!response.ok) throw new Error(`npm registry returned ${response.status}`);
  const payload = await response.json();
  return payload && payload.version;
}

async function sdkRelease(options) {
  const current = packageSdkVersion(options.projectPath);
  if (!current) return undefined;
  const available = await options.getLatestSdkVersion();
  if (typeof available !== 'string' || !isNewerVersion(available, current)) return undefined;
  return {
    id: available,
    label: 'now-sdk',
    current,
    available,
  };
}

function docsRelease(options) {
  const branch = options.docsBranch || gitOutput(options.run, ['rev-parse', '--abbrev-ref', 'HEAD'], options.docsPath);
  if (!branch || branch === 'HEAD') return undefined;
  const localRevision = gitHead(options.run, options.docsPath);
  const availableRevision = remoteHead(options.run, options.docsPath, branch);
  if (!availableRevision || availableRevision === localRevision) return undefined;
  if (!isCleanGitRepository(options.run, options.docsPath)) return undefined;
  return {
    id: availableRevision,
    label: `ServiceNowDocs (${branch})`,
    current: shortRevision(localRevision),
    available: shortRevision(availableRevision),
  };
}

function keyFor(type, location) {
  return location ? `${type}:${path.resolve(location).toLowerCase()}` : type;
}

async function discover(options, componentKey, discoverRelease) {
  const component = options.state.components[componentKey] || {};
  options.state.components[componentKey] = component;
  if (!isDue(component, options.now, options.force)) return undefined;

  component.lastCheckedAt = options.now.toISOString();
  try {
    component.available = await discoverRelease();
    delete component.lastCheckFailedAt;
  } catch {
    component.available = undefined;
    component.lastCheckFailedAt = options.now.toISOString();
  }

  if (!mayNotify(component, options.now)) return undefined;
  component.lastPromptedAt = options.now.toISOString();
  return { component: componentKey, ...component.available };
}

async function checkUpdates(options) {
  const now = options.now || new Date();
  const statePath = options.statePath || statePathForHome(options.home);
  const state = readState(statePath);
  const run = options.run || defaultRun;
  const getLatestSdkVersion = options.getLatestSdkVersion || defaultLatestSdkVersion;
  const context = { ...options, now, state, force: Boolean(options.force), run, getLatestSdkVersion };
  const updates = [];

  if (options.repoRoot) {
    const update = await discover(context, 'agent', () => agentRelease({ ...context, repoRoot: options.repoRoot }));
    if (update) updates.push(update);
  }

  if (options.projectPath) {
    const componentKey = keyFor('sdk', options.projectPath);
    const update = await discover(context, componentKey, () => sdkRelease({ ...context, projectPath: options.projectPath }));
    if (update) updates.push(update);
  }

  if (options.docsPath) {
    const componentKey = keyFor('docs', options.docsPath);
    const update = await discover(context, componentKey, () => docsRelease({ ...context, docsPath: options.docsPath, docsBranch: options.docsBranch }));
    if (update) updates.push(update);
  }

  writeState(statePath, state);
  return updates;
}

function recordDecision(options) {
  if (!['update', 'remind', 'skip'].includes(options.decision)) {
    throw new Error(`Unsupported update decision: ${options.decision}`);
  }
  const now = options.now || new Date();
  const statePath = options.statePath || statePathForHome(options.home);
  const state = readState(statePath);
  const componentKeys = options.componentKeys || [];
  let updated = 0;

  for (const componentKey of componentKeys) {
    const component = state.components[componentKey];
    if (!component || !component.available) continue;
    component.lastDecision = options.decision;
    component.lastDecisionAt = now.toISOString();
    if (options.decision === 'remind') {
      component.snoozedUntil = new Date(now.getTime() + REMINDER_INTERVAL_MS).toISOString();
    } else if (options.decision === 'skip') {
      component.skippedRelease = component.available;
      delete component.snoozedUntil;
    } else {
      delete component.snoozedUntil;
    }
    updated += 1;
  }

  writeState(statePath, state);
  return updated;
}

module.exports = {
  CHECK_INTERVAL_MS,
  REMINDER_INTERVAL_MS,
  checkUpdates,
  isNewerVersion,
  keyFor,
  recordDecision,
  statePathForHome,
};
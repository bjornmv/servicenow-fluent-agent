'use strict';

// Linux/macOS counterpart of the Windows "PowerShell with now-sdk" profile functions:
// a managed `now-sdk` shell function in ~/.bashrc that prefers the project-local SDK
// (./node_modules/@servicenow/sdk) and falls back to the global npm install.
// Interactive VS Code integrated terminals (desktop, Remote, `code serve-web`) source
// ~/.bashrc, so agent `run_in_terminal` calls get the same precedence as on Windows.

const fs = require('node:fs');
const path = require('node:path');

const BEGIN = '# >>> servicenow-fluent-agent now-sdk >>>';
const END = '# <<< servicenow-fluent-agent now-sdk <<<';

const FUNCTION_BLOCK = [
  BEGIN,
  '# Managed by servicenow-fluent-agent (install/uninstall). Project-local SDK first, then global.',
  'now-sdk() {',
  '  local sdk="./node_modules/@servicenow/sdk/bin/index.js"',
  '  if [ ! -f "$sdk" ]; then sdk="$(npm root -g 2>/dev/null)/@servicenow/sdk/bin/index.js"; fi',
  '  node "$sdk" "$@"',
  '}',
  '# sn-skill shim directory (see skillShim below); many distros only add it at login when it exists.',
  'case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) PATH="$HOME/.local/bin:$PATH" ;; esac',
  END,
].join('\n');

function rcFile(home) {
  return path.join(home, '.bashrc');
}

function stripBlock(text) {
  const start = text.indexOf(BEGIN);
  if (start === -1) return text;
  const end = text.indexOf(END, start);
  if (end === -1) return text; // unterminated: leave untouched
  let after = end + END.length;
  if (text[after] === '\n') after += 1;
  let before = start;
  if (before > 0 && text[before - 1] === '\n' && text[before - 2] === '\n') before -= 1;
  return text.slice(0, before) + text.slice(after);
}

// Returns { file, status: 'added' | 'updated' | 'unchanged', text } without writing.
function planShellFunction(home) {
  const file = rcFile(home);
  let original = '';
  try {
    original = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error;
  }
  const hasBlock = original.includes(BEGIN);
  if (hasBlock && !original.includes(END)) {
    throw new Error(`${file} has an unterminated "${BEGIN}" block; fix it by hand before installing.`);
  }
  const base = stripBlock(original);
  const separator = base === '' || base.endsWith('\n\n') ? '' : base.endsWith('\n') ? '\n' : '\n\n';
  const text = `${base}${separator}${FUNCTION_BLOCK}\n`;
  const status = text === original ? 'unchanged' : hasBlock ? 'updated' : 'added';
  return { file, status, text, original };
}

function ensureShellFunction(home, { dryRun = false } = {}) {
  const plan = planShellFunction(home);
  if (plan.status !== 'unchanged' && !dryRun) fs.writeFileSync(plan.file, plan.text);
  return { file: plan.file, status: dryRun && plan.status !== 'unchanged' ? `would be ${plan.status}` : plan.status };
}

function removeShellFunction(home, { dryRun = false } = {}) {
  const file = rcFile(home);
  let original;
  try {
    original = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return { file, status: 'absent' };
    throw error;
  }
  if (!original.includes(BEGIN)) return { file, status: 'absent' };
  const text = stripBlock(original);
  if (text === original) return { file, status: 'unterminated (left untouched)' };
  if (!dryRun) fs.writeFileSync(file, text);
  return { file, status: dryRun ? 'would be removed' : 'removed' };
}

// `sn-skill` as a real command, so agents that do not read ~/.bashrc (non-interactive
// shells, other agent hosts) still find it when the directory is on PATH: ~/.local/bin on
// Linux/macOS, ~/bin for Git Bash on Windows. The dispatcher path is written absolute,
// so a remapped $HOME cannot redirect it.
const SHIM_MARK = '# Managed by servicenow-fluent-agent: sn-skill dispatcher shim.';

function skillShimText(dispatcher) {
  const quoted = `'${dispatcher.replaceAll('\\', '/').replaceAll("'", "'\\''")}'`;
  return `#!/bin/sh\n${SHIM_MARK}\nexec node ${quoted} "$@"\n`;
}

function skillShimFile(home, { windows = process.platform === 'win32' } = {}) {
  return windows ? path.join(home, 'bin', 'sn-skill') : path.join(home, '.local', 'bin', 'sn-skill');
}

function readIfExists(file) {
  try { return fs.readFileSync(file, 'utf8'); }
  catch (error) { if (error && error.code === 'ENOENT') return null; throw error; }
}

function ensureSkillShim(home, { dryRun = false, windows } = {}) {
  const file = skillShimFile(home, { windows });
  const text = skillShimText(path.join(home, '.agents', 'tools', 'sn-skill.cjs'));
  const current = readIfExists(file);
  if (current !== null && !current.includes(SHIM_MARK)) return { file, status: 'left unchanged (not created by this installer)' };
  if (current === text) return { file, status: 'unchanged' };
  const status = current === null ? 'added' : 'updated';
  if (dryRun) return { file, status: `would be ${status}` };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, { mode: 0o755 });
  fs.chmodSync(file, 0o755);
  return { file, status };
}

function removeSkillShim(home, { dryRun = false, windows } = {}) {
  const file = skillShimFile(home, { windows });
  const current = readIfExists(file);
  if (current === null) return { file, status: 'absent' };
  if (!current.includes(SHIM_MARK)) return { file, status: 'left unchanged (not created by this installer)' };
  if (!dryRun) fs.rmSync(file);
  return { file, status: dryRun ? 'would be removed' : 'removed' };
}

// Git for Windows (not MinGit) ships bash; only then is a Git Bash shim useful.
function findGitBash(env = process.env, exists = file => fs.existsSync(file)) {
  const roots = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA && path.win32.join(env.LOCALAPPDATA, 'Programs')].filter(Boolean);
  return roots.map(root => path.win32.join(root, 'Git', 'bin', 'bash.exe')).find(file => exists(file)) || null;
}

module.exports = { BEGIN, END, FUNCTION_BLOCK, SHIM_MARK, planShellFunction, ensureShellFunction, removeShellFunction, stripBlock, skillShimText, skillShimFile, ensureSkillShim, removeSkillShim, findGitBash };

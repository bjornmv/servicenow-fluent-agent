#!/usr/bin/env node
'use strict';

// One OS-neutral entry point for the bundled skill helpers. Skills write
// `sn-skill <name> <arguments>`; the installer makes `sn-skill` a command:
// a PowerShell function in the VS Code SDK terminal profile on Windows, a
// shell-script shim on PATH on Linux/macOS (and in Git Bash when present).
// Without either, run this file with node and the same arguments.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const agentsRoot = path.resolve(__dirname, '..');

// Names are the contract that skill text uses; paths are relative to ~/.agents.
const COMMANDS = {
  rest: { script: 'skills/sn-rest/sn-rest.js', about: 'Instance REST and schema reads/writes over the SDK OAuth alias (sn-rest).' },
  docs: { script: 'skills/sn-doc-lookup/bin/sn-doc-md.js', about: 'Local ServiceNow documentation index and search (sn-doc-lookup).' },
  'doc-render': { script: 'skills/sn-doc-export/render.js', about: 'Render Markdown to DOCX/PDF/HTML (sn-doc-export).' },
  'doc-capture': { script: 'skills/sn-doc-export/capture.cjs', about: 'Capture instance screenshots for documents (sn-doc-export).' },
  update: { script: 'tools/sn-update-advisor.cjs', about: 'Agent update check, decisions and state (sn-update-advisor).' },
  'project-sdk': { script: 'skills/sn-update-advisor/scripts/update-project-sdk.cjs', about: 'Project-local SDK update preflight/apply/status (sn-update-advisor).' },
  zip: { script: 'tools/sn-zip.cjs', about: 'List or extract a zip archive, e.g. a now-sdk pack output (sn-zip).' },
  deletes: { script: 'tools/sn-deletes.cjs', about: 'List records the last build will DELETE on install (sn-build-install).' },
};

function usage(stream) {
  stream.write('Usage: sn-skill <name> [arguments]\n\n');
  for (const [name, { about }] of Object.entries(COMMANDS)) stream.write(`  ${name.padEnd(12)} ${about}\n`);
}

function resolveCommand(name) {
  if (!Object.hasOwn(COMMANDS, name)) return null;
  return path.join(agentsRoot, ...COMMANDS[name].script.split('/'));
}

function main(argv) {
  const [name, ...rest] = argv;
  if (!name || name === '--help' || name === '-h' || name === 'list') {
    usage(name ? process.stdout : process.stderr);
    return name ? 0 : 2;
  }
  const script = resolveCommand(name);
  if (!script) {
    process.stderr.write(`sn-skill: unknown name "${name}". Nothing was run.\n`);
    usage(process.stderr);
    return 2;
  }
  if (!fs.existsSync(script)) {
    process.stderr.write(`sn-skill: ${name} helper is missing at ${script}. Nothing was run; reinstall the agent.\n`);
    return 2;
  }
  // A child Node keeps each helper's own entry checks (require.main, ESM) intact.
  // No shell is involved, so arguments reach the helper exactly as received.
  const result = spawnSync(process.execPath, [script, ...rest], { stdio: 'inherit', windowsHide: true });
  if (result.error) {
    process.stderr.write(`sn-skill: could not start ${name}: ${result.error.message}\n`);
    return 1;
  }
  const code = result.status === null ? 1 : result.status;
  // Native exit evidence on stderr, so no shell-specific exit idiom is needed.
  process.stderr.write(`sn-skill: ${name} exit=${code}${result.signal ? ` signal=${result.signal}` : ''}\n`);
  return code;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { COMMANDS, resolveCommand, main };

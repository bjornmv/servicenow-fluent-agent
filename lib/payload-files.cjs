'use strict';
const fs = require('node:fs');
const path = require('node:path');
// Only the documentation acceptance harness is part of the runtime payload.
function excluded(relative, directory = false) {
  const rel = relative.replace(/\\/g, '/');
  const parts = rel.split('/');
  if (parts.some(p => ['.git', 'node_modules', '__pycache__'].includes(p))) return true;
  const acceptance = '.agents/skills/sn-doc-lookup/test';
  if (parts.some(p => p === 'test' || p === 'tests') && rel !== acceptance && !rel.startsWith(acceptance + '/')) return true;
  return !directory && /\.(?:pyc|pyo|tmp|bak)$|(?:^|\/)\.DS_Store$|(?:^|\/)Thumbs\.db$/i.test(rel);
}
function payloadFiles(root) {
  const files = [];
  function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, item.name);
      if (excluded(path.relative(root, full), item.isDirectory())) continue;
      if (item.isDirectory()) walk(full);
      else if (item.isFile()) files.push(full);
    }
  }
  if (fs.existsSync(root)) walk(root);
  return files;
}
module.exports = { excluded, payloadFiles };

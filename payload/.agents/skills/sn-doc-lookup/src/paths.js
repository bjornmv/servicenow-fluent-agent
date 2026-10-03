'use strict';

const path = require('path');

// Resolution only: never create, move, download or index anything here.
function resolveLocation(explicit, override, leaf, env) {
  const selected = explicit || env[override];
  if (selected) {
    if (typeof selected !== 'string' || !selected.trim()) throw new Error(`Invalid path for ${override}`);
    return path.resolve(selected);
  }
  if (!env.LOCALAPPDATA || !path.isAbsolute(env.LOCALAPPDATA)) {
    throw new Error(`LOCALAPPDATA must be an absolute path; supply an explicit path or ${override}`);
  }
  return path.join(env.LOCALAPPDATA, 'SNDocs', leaf);
}

function resolveDocs(explicit, env = process.env) {
  return resolveLocation(explicit, 'SN_DOCS_HOME', 'repo', env);
}

function resolveIndex(explicit, env = process.env) {
  return resolveLocation(explicit, 'SN_DOC_MD_INDEX', 'index', env);
}

module.exports = { resolveDocs, resolveIndex };

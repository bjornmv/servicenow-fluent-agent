'use strict';

const os = require('os');
const path = require('path');

// Default data root. Windows (unchanged): %LOCALAPPDATA%\SNDocs, failing closed when unset.
// Elsewhere: $XDG_DATA_HOME/SNDocs, or ~/.local/share/SNDocs when XDG_DATA_HOME is unset or
// relative (the XDG spec ignores relative values). Never the cwd.
function defaultBase(override, env, platform) {
  if (platform === 'win32') {
    if (!env.LOCALAPPDATA || !path.isAbsolute(env.LOCALAPPDATA)) {
      throw new Error(`LOCALAPPDATA must be an absolute path; supply an explicit path or ${override}`);
    }
    return path.join(env.LOCALAPPDATA, 'SNDocs');
  }
  if (env.XDG_DATA_HOME && path.isAbsolute(env.XDG_DATA_HOME)) return path.join(env.XDG_DATA_HOME, 'SNDocs');
  const home = env.HOME && path.isAbsolute(env.HOME) ? env.HOME : os.homedir();
  if (!home || !path.isAbsolute(home)) throw new Error(`No absolute home directory; supply an explicit path or ${override}`);
  return path.join(home, '.local', 'share', 'SNDocs');
}

// Resolution only: never create, move, download or index anything here.
function resolveLocation(explicit, override, leaf, env, platform) {
  const selected = explicit || env[override];
  if (selected) {
    if (typeof selected !== 'string' || !selected.trim()) throw new Error(`Invalid path for ${override}`);
    return path.resolve(selected);
  }
  return path.join(defaultBase(override, env, platform), leaf);
}

function resolveDocs(explicit, env = process.env, platform = process.platform) {
  return resolveLocation(explicit, 'SN_DOCS_HOME', 'repo', env, platform);
}

function resolveIndex(explicit, env = process.env, platform = process.platform) {
  return resolveLocation(explicit, 'SN_DOC_MD_INDEX', 'index', env, platform);
}

module.exports = { resolveDocs, resolveIndex };

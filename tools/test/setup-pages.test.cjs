'use strict';

// Offline documentation/package tests. PowerShell snippets run only with fixture
// downloads/Git discovery/clone commands; never install Git or access the network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const vm = require('node:vm');
const { measureGuide } = require('../setup-guide-metrics.cjs');
const { stageSetupPages, validateBootstrapHash, validateSdkSetupHash, workerRelativePath, downloadRelativePath, sdkWorkerRelativePath, sdkDownloadRelativePath } = require('../stage-setup-pages.cjs');

const root = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const setup = read('setup.md');
const gitSetup = read('git-setup.md');
const worker = read(workerRelativePath);
const skill = read('payload/.agents/skills/win-git-bootstrap/SKILL.md');
const workflow = read('.github/workflows/deploy-setup-page.yml');

function withTemp(fn) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-setup-pages-'));
  try { return fn(directory); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

function sourceFixture(directory) {
  const source = path.join(directory, 'source');
  for (const file of ['setup.md', 'git-setup.md', 'VERSION', 'package.json', 'manifest.json', workerRelativePath, sdkWorkerRelativePath]) {
    const destination = path.join(source, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, file), destination);
  }
  return source;
}

function psBlock(id) {
  const matches = [...setup.matchAll(new RegExp(`<!-- setup-block:${id} -->\\s*\\x60{3}powershell\\r?\\n([\\s\\S]*?)\\x60{3}`, 'g'))];
  assert.equal(matches.length, 1, `one PowerShell block: ${id}`);
  return matches[0][1];
}
function appendix(id) {
  const match = setup.match(new RegExp(`<a id="${id}"></a>([\\s\\S]*?)(?=<a id=|$)`));
  assert.ok(match, `appendix anchor: ${id}`);
  return match[1];
}
function contract(text, patterns) {
  for (const pattern of patterns) assert.match(text, pattern);
}
const windows = { skip: process.platform !== 'win32' };
const psQuote = s => "'" + s.replaceAll("'", "''") + "'";
function runSnippet(directory, block, prelude = '') {
  const file = path.join(directory, 'fixture.ps1');
  fs.writeFileSync(file, `$ErrorActionPreference='Stop'\n$FixtureRoot=${psQuote(directory)}\n${prelude}\ntry {\n${block}\nWrite-Output 'FIXTURE_COMPLETE'\n} catch { Write-Output ('FIXTURE_ERROR: '+$_.Exception.Message); exit 11 }\n`);
  const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const r = spawnSync(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', file], {
    cwd: directory, env: { ...process.env, LOCALAPPDATA: path.join(directory, 'Local') }, encoding: 'utf8', timeout: 30000,
  });
  assert.ifError(r.error);
  return r;
}

test('guide declares supported scope, runtime and resumable evidence', () => {
  contract(setup, [/Windows x64, VS Code, GitHub Copilot agent mode/, /Another harness[\s\S]*step 7 requires real VS Code terminal evidence/, /`latest` dist-tag/, /Only the current versioned reference copy is published/]);
  assert.equal(JSON.parse(read('package.json')).engines.node, '>=20.18.0');
  const recovery = psBlock('sdk-recovery');
  for (const variable of ['$PowerShellExe', '$SdkWorker', '$SdkLogDir']) assert.ok(recovery.includes(variable + " = '<recorded absolute"));
  assert.match(recovery, /Fill the original recorded paths/);
  for (const field of ['NODE_VERSION', 'SDK_STATUS', 'DOCS_FAMILY_SOURCE', 'DOCS_GIT_HEAD', 'INDEX_PROVENANCE', 'PAYLOAD_VERIFY', 'TERMINAL_CHECK', 'NEXT_STEP']) {
    assert.ok(setup.includes('\n' + field + '='), field);
  }
});

test('all eight decision cards have Pre, Run, Expect and If–then', () => {
  const main = setup.split(/^## Outcome:/m)[0];
  const cards = [...main.matchAll(/^### (\d+)\. ([^\n]+)\r?\n([\s\S]*?)(?=^### \d+\.|(?![\s\S]))/gm)];
  assert.deepEqual(cards.map(m => Number(m[1])), [0, 1, 2, 3, 4, 5, 6, 7]);
  for (const [, number, , body] of cards) {
    for (const label of ['Pre', 'Run', 'Expect', 'If–then']) {
      assert.match(body, new RegExp(`\\*\\*${label}:\\*\\*\\s*\\S`), `card ${number}: ${label}`);
    }
  }
});

test('internal appendix links resolve and executable block IDs are unique and complete', () => {
  const anchors = [...setup.matchAll(/<a id="([^"]+)"><\/a>/g)].map(m => m[1]);
  assert.equal(new Set(anchors).size, anchors.length, 'unique explicit anchors');
  const links = [...setup.matchAll(/\]\(#([^)]+)\)/g)].map(m => m[1]);
  assert.ok(links.length > 0);
  for (const target of links) assert.ok(anchors.includes(target), `unresolved #${target}`);
  for (const target of ['guide-download', 'git-download', 'sdk-download', 'prerequisites', 'sdk-recovery', 'sdk-evidence', 'docs-checkout', 'agent-checkout', 'terminal-check', 'rationale']) {
    assert.ok(links.includes(target), `reachable appendix: ${target}`);
  }
  const ids = [...setup.matchAll(/<!-- setup-block:([^\s]+) -->/g)].map(m => m[1]);
  assert.ok(ids.length > 0);
  assert.equal(new Set(ids).size, ids.length, 'unique block IDs');
  const tagged = [...setup.matchAll(/<!-- setup-block:([^\s]+) -->\s*```(powershell|text)\r?\n/g)];
  assert.equal(tagged.length, ids.length, 'every ID labels a fenced block');
  assert.equal(tagged.filter(m => m[2] === 'powershell').length, [...setup.matchAll(/^```powershell\r?$/gm)].length, 'every PowerShell block has an ID');
});

test('editorial budget counts the whole guide, not just the main path', () => {
  const metrics = measureGuide(setup);
  for (const [key, maximum] of Object.entries({ totalProseWords: 2700, mainProseWords: 1300, sdkStepProseWords: 180 })) {
    assert.ok(metrics[key] > 0 && metrics[key] <= maximum, `${key}=${metrics[key]}, budget=${maximum}`);
  }
  assert.ok(metrics.appendixProseWords > 0, 'appendices must count');
  assert.equal(metrics.totalProseWords, metrics.mainProseWords + metrics.appendixProseWords);
  // Counting convention: omit frontmatter, fences, comments, HTML and link URLs;
  // count whitespace tokens with letters/digits, retaining inline code/link labels.
  const sample = '---\nignored: metadata\n---\n# Heading\n[link label](https://ignored.invalid) `inline` / ** --\n<!-- hidden words -->\n<a id="ignored"></a>\n```text\nignored code\n```\n';
  assert.equal(measureGuide(sample).totalProseWords, 4);
  const main = 'alpha beta\n## Appendices:\ngamma delta\n';
  const moved = 'alpha\n## Appendices:\nbeta gamma delta\n';
  assert.equal(measureGuide(main).totalProseWords, measureGuide(moved).totalProseWords, 'moving prose alone cannot reduce total');
  assert.equal(measureGuide(setup + '\nappendix sentinel\n').totalProseWords, metrics.totalProseWords + 2, 'whole-document counting includes trailing appendix prose');
});

test('documented Node gate rejects below 20.18 while permitting the minimum and newer majors', () => {
  const expression = psBlock('node-check').match(/node\.exe -e "([^"\n]+)"/)[1];
  for (const [version, expected] of [['18.20.0', 1], ['20.17.9', 1], ['20.18.0', 0], ['22.0.0', 0], ['25.2.1', 0]]) {
    let result;
    vm.runInNewContext(expression, { process: { versions: { node: version }, exit: code => { result = code; } } });
    assert.equal(result, expected, version);
  }
});

for (const mode of ['valid', 'hash', 'protocol', 'missing-end', 'duplicate-end']) {
  test('guide verification block on Windows: ' + mode, windows, () => withTemp(directory => {
    const output = path.join(directory, 'published');
    stageSetupPages(output);
    const guide = path.join(output, 'setup.txt');
    const manifestPath = path.join(output, 'setup-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath));
    if (mode === 'hash') fs.appendFileSync(guide, '\nchanged\n');
    if (mode === 'protocol') manifest.version = '0.0.0';
    if (mode === 'missing-end' || mode === 'duplicate-end') {
      const text = fs.readFileSync(guide, 'utf8');
      fs.writeFileSync(guide, mode === 'missing-end' ? text.replace(/^SETUP_GUIDE_END=.*$/m, '') : text + '\nSETUP_GUIDE_END=' + manifest.version + '\n');
      manifest.setup.sha256 = crypto.createHash('sha256').update(fs.readFileSync(guide)).digest('hex');
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const prelude = `function Invoke-WebRequest { param($Uri,$OutFile,[switch]$UseBasicParsing,$TimeoutSec)\n if ($Uri -notin @('https://bjornmv.github.io/servicenow-fluent-agent/setup.txt','https://bjornmv.github.io/servicenow-fluent-agent/setup-manifest.json')) { throw 'Unexpected fixture URL' }\n Copy-Item -LiteralPath (Join-Path $FixtureRoot ('published\\'+($Uri -split '/')[-1])) -Destination $OutFile\n}`;
    const r = runSnippet(directory, psBlock('guide-download'), prelude);
    assert.equal(r.status, mode === 'valid' ? 0 : 11, r.stdout + r.stderr);
    if (mode === 'valid') assert.match(r.stdout, /GUIDE_VERSION=0\.3\.8/);
    else assert.doesNotMatch(r.stdout, /GUIDE_VERSION=|FIXTURE_COMPLETE/);
  }));
}

for (const mode of ['path', 'standard', 'old', 'blocked', 'prerelease', 'absent', 'registered', 'directory', 'denied']) {
  test('Git discovery block uses fixture evidence: ' + mode, windows, () => withTemp(directory => {
    const prelude = `$Mode=${psQuote(mode)}\nfunction Get-Command { param($Name,$CommandType,$ErrorAction) if ($Mode -in @('path','old','blocked','prerelease')) { return @{Source='Invoke-FixtureGit'} } }\nfunction Test-Path { param($LiteralPath,$PathType,$ErrorAction)\n if ($LiteralPath -like '*Git_is1') { if ($Mode -eq 'denied') { throw 'Registry unreadable' }; return ($Mode -eq 'registered') }\n if ($LiteralPath -like '*cmd\\git.exe') { return ($Mode -eq 'standard') }\n return ($Mode -eq 'directory')\n}\nfunction Get-ItemProperty { param($LiteralPath,$ErrorAction) return @{InstallLocation='C:\\fixture-git'} }\nfunction Resolve-Path { param($LiteralPath) return @{Path='Invoke-FixtureGit'} }\nfunction Invoke-FixtureGit { $global:LASTEXITCODE=0; if ($Mode -eq 'blocked') { $global:LASTEXITCODE=23; return }; if ($Mode -eq 'old') { 'git version 2.53.0.windows.1' } elseif ($Mode -eq 'prerelease') { 'git version 2.55.0.rc1' } else { 'git version 2.54.0.windows.1' } }`;
    const r = runSnippet(directory, psBlock('git-check'), prelude);
    assert.equal(r.status, ['path', 'standard', 'absent'].includes(mode) ? 0 : 11, r.stdout + r.stderr);
    if (mode === 'absent') assert.match(r.stdout, /GIT_EXE=absent/);
    else assert.doesNotMatch(r.stdout, /GIT_EXE=absent/);
  }));
}

for (const mode of ['success', 'failed', 'leftover', 'collision']) {
  test('staged docs clone preserves fixture directories: ' + mode, windows, () => withTemp(directory => {
    const docs = path.join(directory, 'docs');
    if (mode === 'leftover') fs.mkdirSync(docs + '.incoming-old');
    const prelude = `$Docs=${psQuote(docs)}\n$Mode=${psQuote(mode)}\n$Family='australia'\n$DocsUrl='https://github.com/ServiceNow/ServiceNowDocs.git'\n$GitExe='Invoke-FixtureGit'\nfunction Invoke-FixtureGit {\n if ($args[0] -ne 'clone') { throw 'Not a clone' }\n New-Item -ItemType Directory -Path $args[-1] | Out-Null\n Set-Content -LiteralPath (Join-Path $FixtureRoot 'clone.calls') -Value ($args -join '|')\n $global:LASTEXITCODE=0\n if ($Mode -eq 'failed') { $global:LASTEXITCODE=23 }\n if ($Mode -eq 'collision') { New-Item -ItemType Directory -Path $Docs | Out-Null }\n}`;
    const r = runSnippet(directory, psBlock('docs-clone'), prelude);
    assert.equal(r.status, mode === 'success' ? 0 : 11, r.stdout + r.stderr);
    const incoming = fs.readdirSync(directory).filter(n => n.startsWith('docs.incoming-'));
    assert.equal(incoming.length, mode === 'success' ? 0 : 1);
    assert.equal(fs.existsSync(docs), ['success', 'collision'].includes(mode));
    assert.equal(fs.existsSync(path.join(directory, 'clone.calls')), mode !== 'leftover');
    if (mode !== 'leftover') assert.match(fs.readFileSync(path.join(directory, 'clone.calls'), 'utf8'), /clone\|-c\|core\.longpaths=true\|--depth\|1\|--single-branch\|--branch\|australia/);
  }));
}

for (const target of ['docs', 'agent']) {
  for (const mode of ['success', 'root', 'origin', 'branch', 'dirty', 'native-failure']) {
    test(`${target} checkout guard executes on Windows: ${mode}`, windows, () => withTemp(directory => {
      const repo = path.join(directory, target);
      fs.mkdirSync(repo);
      const expectedUrl = target === 'docs' ? 'https://github.com/ServiceNow/ServiceNowDocs.git' : 'https://github.com/bjornmv/servicenow-fluent-agent.git';
      const branch = target === 'docs' ? 'australia' : 'main';
      const prelude = `$Mode=${psQuote(mode)}\n$ExpectedUrl=${psQuote(expectedUrl)}\n$ExpectedBranch=${psQuote(branch)}\n$Docs=${psQuote(repo)}\n$DocsUrl=$ExpectedUrl\n$Family=$ExpectedBranch\n$GitExe='Invoke-FixtureGit'\nfunction Invoke-FixtureGit {\n Add-Content -LiteralPath (Join-Path $FixtureRoot 'git.calls') -Value ($args -join '|')\n $global:LASTEXITCODE=0\n if ($args[2] -eq 'rev-parse') {\n   if ($Mode -eq 'native-failure') { $global:LASTEXITCODE=23; return }\n   if ($args[3] -eq '--show-toplevel') { if ($Mode -eq 'root') { $FixtureRoot } else { $args[1] }; return }\n   'abcdef0123456789'; return\n }\n if ($args[2] -eq 'remote') { if ($Mode -eq 'origin') { 'https://example.invalid/unapproved.git' } else { $ExpectedUrl }; return }\n if ($args[2] -eq 'branch') { if ($Mode -eq 'branch') { 'other' } else { $ExpectedBranch }; return }\n if ($args[2] -eq 'status') { if ($Mode -eq 'dirty') { ' M README.md' }; return }\n if ($args[2] -eq 'pull') { if ($args[4] -ne 'origin' -or $args[5] -ne $ExpectedBranch) { throw 'Pull must name verified remote/branch, not the configured upstream' }; return }\n throw 'Unexpected fixture command'\n}`;
      const block = target === 'docs'
        ? psBlock('docs-verify') + '\n' + psBlock('docs-pull')
        : psBlock('agent-checkout').replace("$AgentRepo = Join-Path $HOME 'source\\servicenow-fluent-agent'", "$AgentRepo = Join-Path $FixtureRoot 'agent'");
      if (target === 'agent') assert.ok(block.includes("Join-Path $FixtureRoot 'agent'"), 'fixture must never use real HOME');
      const r = runSnippet(directory, block, prelude);
      assert.equal(r.status, mode === 'success' ? 0 : 11, r.stdout + r.stderr);
      const calls = fs.readFileSync(path.join(directory, 'git.calls'), 'utf8');
      if (mode === 'success') assert.ok(calls.includes('pull|--ff-only|origin|' + branch), calls);
      else assert.doesNotMatch(calls, /pull|clone/);
    }));
  }
}

test('checkout identity and index provenance gate reuse, pulls and approved rebuilds', () => {
  for (const id of ['docs-verify', 'agent-checkout']) {
    const text = psBlock(id);
    for (const command of ['rev-parse --show-toplevel', 'remote get-url origin', 'branch --show-current', 'status --porcelain']) assert.ok(text.includes(command), command);
    assert.match(text, /\$LASTEXITCODE -ne 0/);
  }
  contract(psBlock('agent-checkout'), [/\$AgentRepo = Join-Path \$HOME 'source\\servicenow-fluent-agent'/, /Set-Location -LiteralPath \$AgentRepo -ErrorAction Stop/]);
  assert.match(psBlock('index-inspect'), /Join-Path \$Index 'manifest.json'/);
  contract(setup, [
    /Existing-index replacement and corpus changes require separate approval/,
    /schema_version: 1/, /generator` starting `sn-doc-md@/, /matching `family` and resolved `docs_root`/,
    /`git_head` with `\$DocsHead`.*empty means unknown, not current/,
    /Recognized and current[^\n]*Reuse; skip build/,
    /outdated\/unknown revision[^\n]*Ask: reuse with that limitation[^\n]*approve rebuild/,
    /Unexpected identity or unreadable manifest[^\n]*Stop for review; preserve/,
    /approved recognized-index rebuild adds `--force`/, /never delete a directory/,
    /no automatic rebuild or alternate corpus/, /Native exit 0 and all benchmark cases pass/,
  ]);
  assert.doesNotMatch(psBlock('index-build'), /--force/);
  assert.doesNotMatch(setup, /remote set-branches|git switch|--force.*--family/);
});

test('scope and prerequisite decisions allow only absent-Git bootstrap, not replacement', () => {
  contract(setup, [
    /Node\.js must already be installed/, /global SDK package install\/update/,
    /Authentication, deployment, other prerequisites and elevation are outside scope/,
    /Missing\/failing\/old Node[^\n]*report the prerequisite failure/,
    /Genuinely absent Git[^\n]*#git-download/,
    /Older, blocked, broken, prerelease or ambiguous Git[^\n]*review, not automatic replacement/,
    /stable Git \*\*>=2\.54\.0\*\*, preserved unchanged/,
  ]);
  contract(appendix('git-download'), [/without cloning/, /only `-InstallIfMissing`/, /2\.54\.0\.windows\.1/, /find\/sort excluded.*\*\*before extraction\*\*/, /Migration\/replacement modes are outside setup/, /Verify completion.*absolute `\$GitExe` before step 2/]);
  assert.match(psBlock('docs-clone'), /& \$GitExe clone/);
  assert.match(psBlock('agent-checkout'), /& \$GitExe -C "\$AgentRepo" pull --ff-only/);
});

test('separate page reuses the single canonical skill and worker', () => {
  assert.match(gitSetup, /permalink: \/git-setup\//);
  assert.match(gitSetup, /raw\.githubusercontent\.com\/bjornmv\/servicenow-fluent-agent\/main\/payload\/\.agents\/skills\/win-git-bootstrap\/SKILL\.md/);
  assert.match(gitSetup, /not another installer implementation/);
  assert.match(skill, /references\/validation\.md/);
  assert.ok(fs.existsSync(path.join(root, 'payload/.agents/skills/win-git-bootstrap/references/validation.md')));
});

test('HTTPS handoff needs no Git and hashes the saved script before execution', () => {
  const url = gitSetup.match(/\$BootstrapUrl = '([^']+)'/)[1];
  assert.equal(url, 'https://bjornmv.github.io/servicenow-fluent-agent/' + downloadRelativePath);
  const blocks = [...gitSetup.matchAll(/```powershell\n([\s\S]*?)```/g)].map(match => match[1]);
  assert.match(blocks[0], /Invoke-WebRequest/);
  assert.match(blocks[0], /Get-FileHash -LiteralPath \$BootstrapPath -Algorithm SHA256/);
  assert.doesNotMatch(blocks[0], /-File \$BootstrapPath/);
  assert.match(blocks[1], /-File \$BootstrapPath -InstallIfMissing/);
  assert.match(blocks[1], /\$LASTEXITCODE -ne 0/);
  for (const block of blocks) {
    assert.doesNotMatch(block, /git(?:\.exe)? clone/i);
    assert.doesNotMatch(block, /ExecutionPolicy\s+Bypass|Unblock-File|Invoke-Expression|\biex\b/i);
  }
  assert.match(gitSetup, /Read the saved script before executing it/);
});

test('Git registration preserves user environment and is verified outside the SDK profile', () => {
  contract(setup, [/install --git-exe "\$GitExe"/, /configure-git --git-exe "\$GitExe"/, /SN_FLUENT_ENV_REFRESH/, /PATH itself is never passed through `setx`/, /independently of shell type/, /npm-cli\.js/]);
  contract(appendix('rationale'), [/preserves raw Windows user PATH\/type and backups/, /Machine PATH, Git installation\/config and policy are unchanged/, /Unrelated custom settings remain preserved/]);
  contract(appendix('terminal-check'), [/including outside the SDK profile/, /report untested hosts separately/, /Reload Window alone is not a guaranteed environment refresh/, /refreshed launcher/]);
  assert.doesNotMatch(setup, /\$env:Path =/);
});

test('agent terminal handoff is the final step and the launch prompt stays short', () => {
  const headings = [...setup.matchAll(/^### (\d+)\. (.+)$/gm)];
  assert.deepEqual(headings.map(m => Number(m[1])), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.match(headings.at(-1)[2], /Open a fresh agent terminal and verify \(final step\)/);
  assert.match(setup, /\*\*Run:\*\* The agent performs \[E: terminal handoff and checks\]\(#terminal-check\)/);
  const prompt = setup.match(/Give a new agent[\s\S]*?```text\n([^`]+)```/)[1].trim();
  assert.equal(prompt, 'Read https://bjornmv.github.io/servicenow-fluent-agent/setup/ and follow its instructions to perform the full ServiceNow Fluent agent setup.');
  assert.ok(read('README.md').includes(prompt));
  assert.doesNotMatch(setup, /not the unversioned|unversioned page is for discovery|\/releases\/\d+\.\d+\.\d+\//);
  assert.match(psBlock('guide-download'), /Get-FileHash -LiteralPath \$Guide -Algorithm SHA256\)\.Hash -ne \$Manifest.setup.sha256/);
});

test('terminal retirement requires saved completion, ownership, idleness and ordered standalone calls', () => {
  const final = appendix('terminal-check');
  const blocks = [...setup.matchAll(/```powershell\r?\n([\s\S]*?)```/g)].map(m => m[1].trim());
  assert.deepEqual(blocks.filter(block => /(?:^|[;\r\n])\s*exit\b/.test(block)), ['exit']);
  assert.equal(psBlock('terminal-exit').trim(), 'exit');
  contract(final, [
    /saved completion of every install\/clone\/index operation/, /no queued commands\/jobs/,
    /idle, disposable agent-owned terminal/, /ownership, idleness or profile selection is uncertain, ask/,
    /instead of closing a user\/shared terminal/, /separate normal synchronous calls in this order/,
    /never append it to another command/, /closed-terminal result leaves saved installation results valid/,
    /Unconfirmed closure[^\n]*not repeated exit/,
  ]);
  const lifecycle = [...final.matchAll(/<!-- setup-block:([^ ]+) -->/g)].map(m => m[1]);
  assert.deepEqual(lifecycle, ['terminal-old', 'terminal-exit', 'terminal-new', 'terminal-verify']);
  assert.match(psBlock('terminal-old'), /SETUP_TERMINAL_PID=\$PID/);
  assert.match(psBlock('terminal-new'), /VERIFICATION_TERMINAL_PID=\$PID/);
});

test('fresh-terminal acceptance requires live PID, strict command kinds and matching versions', () => {
  const final = appendix('terminal-check');
  contract(final, [
    /not an extension, added task or simulated child shell/, /Require a different PID/,
    /absent\/unchanged PID fails/, /chat\.tools\.terminal\.terminalProfile\.windows/,
    /incompatible override requires review rather than replacement/, /Settings are preconditions, not runtime proof/,
    /Set-Location -LiteralPath/, /recorded agent-repo absolute path, avoiding another project's SDK/,
    /Restore no old variables/, /without defining it, injecting PATH or copying startup commands/,
    /Git Application path\/version with step 1/, /SDK version with the verified global package/,
    /mismatches\/nonzero payload results fail acceptance/, /Missing Function[^\n]*not shims or npm reinstallation/,
    /Create New Terminal \(With Profile\)/, /genuinely new terminal, not a restored\/reconnected one/,
  ]);
  const verify = psBlock('terminal-verify');
  contract(verify, [/\$GitCommand.CommandType -ne 'Application'/, /\$SdkCommand.CommandType -ne 'Function'/, /node bin\/sn-fluent-agent.cjs verify/]);
  assert.ok(verify.indexOf("$GitCommand.CommandType -ne 'Application'") < verify.indexOf('\ngit --version'));
  assert.ok(verify.indexOf("$SdkCommand.CommandType -ne 'Function'") < verify.indexOf('\nnow-sdk --version'));
  assert.equal((verify.match(/if \(\$LASTEXITCODE -ne 0\)/g) || []).length, 3, 'Git, SDK and payload native exits checked');
  assert.match(appendix('rationale'), /source evidence, not an end-to-end acceptance result/);
  assert.match(setup, /Installation evidence alone is not fresh-terminal acceptance/);
  assert.doesNotMatch(final, /\[pscustomobject\]|ExecutionPolicy\s+Bypass|skipCheck|Stop-Process/i);
});

test('fresh MinGit installation registers and publishes user environment before SUCCESS', () => {
  const promote = worker.indexOf('Move-Item -LiteralPath $stage -Destination $target');
  const register = worker.indexOf("Add-UserGitPath (Join-Path $target 'cmd')", promote);
  const success = worker.indexOf('SUCCESS: Official MinGit', register);
  assert.ok(promote > 0 && register > promote && success > register);
  assert.match(worker, /Publish-EnvironmentChange \$publisher/);
});

test('documented worker digest matches exact canonical bytes', () => {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, workerRelativePath))).digest('hex');
  assert.equal(validateBootstrapHash(), actual);
});

test('Pages staging copies both documents and download byte-for-byte', () => withTemp(directory => {
  const output = path.join(directory, 'pages');
  const result = stageSetupPages(output);
  const version = read('VERSION').trim();
  assert.deepEqual(result.files, ['setup.md', 'git-setup.md', downloadRelativePath, sdkDownloadRelativePath, 'setup.txt', 'git-setup.txt', 'setup-manifest.json', `releases/${version}/setup.txt`, `releases/${version}/Invoke-SdkSetup.ps1`, `releases/${version}/git-setup.txt`, `releases/${version}/Ensure-MinGit254.ps1`, `releases/${version}/manifest.json`]);
  const release = path.join(output, 'releases', version);
  const text = fs.readFileSync(path.join(release, 'setup.txt'), 'utf8');
  assert.doesNotMatch(text, /^---/);
  assert.equal(text, setup.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''));
  assert.match(text, /SETUP_PROTOCOL_VERSION=/);
  assert.match(text, /SETUP_GUIDE_END=/);
  const manifest = JSON.parse(fs.readFileSync(path.join(release, 'manifest.json'), 'utf8'));
  assert.equal(manifest.version, version);
  assert.equal(manifest.setup.sha256, crypto.createHash('sha256').update(text).digest('hex'));
  assert.equal(manifest.sdkWorker.sha256, validateSdkSetupHash());
  const current = JSON.parse(fs.readFileSync(path.join(output, 'setup-manifest.json'), 'utf8'));
  assert.equal(current.version, version);
  assert.equal(current.setup.file, 'setup.txt');
  assert.equal(current.sdkWorker.file, sdkDownloadRelativePath);
  assert.equal(current.setup.sha256, manifest.setup.sha256);
  assert.equal(current.sdkWorker.sha256, manifest.sdkWorker.sha256);
  for (const [key, expectedFile, original] of [['gitSetup', 'git-setup.txt', 'git-setup.md'], ['gitWorker', downloadRelativePath, workerRelativePath]]) {
    assert.equal(current[key].file, expectedFile);
    const bytes = fs.readFileSync(path.join(output, current[key].file));
    assert.equal(current[key].sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
    const expected = original.endsWith('.md') ? Buffer.from(read(original).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')) : fs.readFileSync(path.join(root, original));
    assert.deepEqual(bytes, expected);
    assert.deepEqual(fs.readFileSync(path.join(release, manifest[key].file)), expected);
    assert.equal(current[key].sha256, manifest[key].sha256);
  }
  assert.equal(fs.readFileSync(path.join(output, current.setup.file), 'utf8'), text);
  assert.deepEqual(fs.readFileSync(path.join(output, current.sdkWorker.file)), fs.readFileSync(path.join(root, sdkWorkerRelativePath)));
  assert.deepEqual(fs.readFileSync(path.join(release, manifest.sdkWorker.file)), fs.readFileSync(path.join(root, sdkWorkerRelativePath)));
  assert.deepEqual(fs.readFileSync(path.join(output, sdkDownloadRelativePath)), fs.readFileSync(path.join(root, sdkWorkerRelativePath)));
  assert.equal(result.sdkSetupSha256, validateSdkSetupHash());
  assert.equal(fs.readFileSync(path.join(output, 'setup.md'), 'utf8'), setup);
  assert.equal(fs.readFileSync(path.join(output, 'git-setup.md'), 'utf8'), gitSetup);
  assert.deepEqual(fs.readFileSync(path.join(output, downloadRelativePath)), fs.readFileSync(path.join(root, workerRelativePath)));
}));

test('altered worker blocks publication before any output is written', () => withTemp(directory => {
  const source = sourceFixture(directory);
  fs.appendFileSync(path.join(source, workerRelativePath), '\n# deliberate test alteration\n');
  const output = path.join(directory, 'pages');
  assert.throws(() => stageSetupPages(output, source), /SHA-256 mismatch/);
  assert.equal(fs.existsSync(output), false);
}));

test('missing or ambiguous worker digest blocks publication', () => withTemp(directory => {
  const source = sourceFixture(directory);
  const page = path.join(source, 'git-setup.md');
  fs.writeFileSync(page, gitSetup.replace('$ExpectedBootstrapSha256 =', '$RemovedDigest ='));
  assert.throws(() => validateBootstrapHash(source), /exactly one/);
  fs.writeFileSync(page, gitSetup + "\n$ExpectedBootstrapSha256 = '" + '0'.repeat(64) + "'\n");
  assert.throws(() => validateBootstrapHash(source), /exactly one/);
}));

test('altered SDK worker blocks publication before output is written', () => withTemp(directory => {
  const source = sourceFixture(directory);
  fs.appendFileSync(path.join(source, sdkWorkerRelativePath), '\n# altered SDK worker\n');
  const output = path.join(directory, 'pages');
  assert.throws(() => stageSetupPages(output, source), /SDK worker SHA-256 mismatch/);
  assert.equal(fs.existsSync(output), false);
}));

test('missing or ambiguous SDK digest blocks publication', () => withTemp(directory => {
  const source = sourceFixture(directory);
  const page = path.join(source, 'setup.md');
  fs.writeFileSync(page, setup.replace('$ExpectedSdkSetupSha256 =', '$RemovedSdkDigest ='));
  assert.throws(() => validateSdkSetupHash(source), /exactly one/);
  fs.writeFileSync(page, setup + "\n$ExpectedSdkSetupSha256 = '" + '0'.repeat(64) + "'\n");
  assert.throws(() => validateSdkSetupHash(source), /exactly one/);
}));

test('release version mismatch blocks publication before writing files', () => withTemp(directory => {
  const source = sourceFixture(directory);
  fs.writeFileSync(path.join(source, 'VERSION'), '0.0.0\n');
  const output = path.join(directory, 'pages');
  assert.throws(() => stageSetupPages(output, source), /release versions disagree/);
  assert.equal(fs.existsSync(output), false);
}));

test('distribution manifest version drift blocks publication before writing output', () => withTemp(dir => {
  const source = sourceFixture(dir);
  const file = path.join(source, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file)); manifest.version = '0.3.0';
  fs.writeFileSync(file, JSON.stringify(manifest));
  const output = path.join(dir, 'output');
  assert.throws(() => stageSetupPages(output, source), /versions disagree/);
  assert.equal(fs.existsSync(output), false);
}));

test('missing guide end marker blocks publication rather than publishing incomplete instructions', () => withTemp(directory => {
  const source = sourceFixture(directory);
  fs.writeFileSync(path.join(source, 'setup.md'), setup.replace(/^SETUP_GUIDE_END=.*$/m, ''));
  const output = path.join(directory, 'pages');
  assert.throws(() => stageSetupPages(output, source), /release versions disagree/);
  assert.equal(fs.existsSync(output), false);
}));

test('worker retains the exact ZIP pin, absent-only guard and pre-extraction exclusions', () => {
  assert.match(worker, /\[switch\]\$InstallIfMissing/);
  assert.match(worker, /if \(\$InstallIfMissing\)/);
  assert.match(worker, /Absent-only agent setup will not upgrade or replace/);
  assert.match(worker, /v2\.54\.0\.windows\.1\/MinGit-2\.54\.0-64-bit\.zip/);
  assert.match(worker, /04F937E1F0918B17B9BE6F2294CB2BB66E96E1D9832D1C298E2DE088A1D0E668/);
  assert.match(worker, /\$excludedFiles = @\('usr\/bin\/find\.exe', 'usr\/bin\/sort\.exe'\)/);
  const verify = worker.indexOf('Pre-extraction exclusions verified:');
  const extract = worker.indexOf('& $tar @excludeArguments -xf $archive -C $stage');
  assert.ok(verify > 0 && extract > verify);
  assert.doesNotMatch(worker, /Expand-Archive/);
  assert.match(worker, /Confirm-NoDeploymentBlocks \$auditStart/);
});

test('Pages rebuilds for docs, canonical worker and staging/test changes', () => {
  for (const entry of ['VERSION', 'tools/setup-guide-metrics.cjs', 'tools/Invoke-SdkSetup.ps1', 'git-setup.md', 'payload/.agents/skills/win-git-bootstrap/**', 'tools/stage-setup-pages.cjs', 'tools/test/setup-pages.test.cjs', 'tools/test/mingit-ssh-probe.test.cjs', 'tools/test/jsonc-settings.test.cjs', 'tools/test/vscode-terminal.test.cjs', 'lib/jsonc-settings.cjs', 'lib/vscode-terminal.cjs', 'lib/windows-git-environment.cjs', 'tools/test/windows-git-environment.test.cjs', 'bin/sn-fluent-agent.cjs']) {
    assert.ok(workflow.includes('      - ' + entry), entry);
  }
  assert.ok(workflow.indexOf('node --test tools/test/setup-pages.test.cjs') < workflow.indexOf('node tools/stage-setup-pages.cjs'));
  assert.match(workflow, /run: node --test tools\/test\/setup-pages\.test\.cjs tools\/test\/mingit-ssh-probe\.test\.cjs/);
  assert.match(JSON.parse(read('package.json')).scripts['test:setup'], /tools\/test\/mingit-ssh-probe\.test\.cjs/);
  assert.match(workflow, /run: node --test [^\n]*tools\/test\/vscode-terminal\.test\.cjs/);
  assert.match(JSON.parse(read('package.json')).scripts['test:setup'], /tools\/test\/vscode-terminal\.test\.cjs/);
  assert.match(workflow, /run: node --test [^\n]*tools\/test\/windows-git-environment\.test\.cjs/);
  assert.match(JSON.parse(read('package.json')).scripts['test:setup'], /tools\/test\/windows-git-environment\.test\.cjs/);
  assert.match(workflow, /run: node --test [^\n]*tools\/test\/setup-sdk-capture\.test\.cjs/);
  assert.match(JSON.parse(read('package.json')).scripts['test:setup'], /tools\/test\/setup-sdk-capture\.test\.cjs/);
  assert.match(workflow, /source: \.\/_pages/);
});

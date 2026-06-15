#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const payloadRoot = path.join(repoRoot, 'payload');
const home = os.homedir();

function toSlash(value) {
  return value.replace(/\\/g, '/');
}

function isIgnoredDir(name) {
  return name === '.git' || name === 'node_modules' || name === '__pycache__';
}

function isIgnoredFile(name) {
  const lower = name.toLowerCase();
  return lower.endsWith('.pyc') || lower.endsWith('.pyo') || lower.endsWith('.tmp') || lower.endsWith('.bak') || lower === '.ds_store' || lower === 'thumbs.db';
}

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyDir(source, target) {
  if (!fs.existsSync(source)) throw new Error(`Source directory not found: ${source}`);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.isDirectory() && isIgnoredDir(entry.name)) continue;
    if (entry.isFile() && isIgnoredFile(entry.name)) continue;
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) copyDir(sourcePath, targetPath);
    else if (entry.isFile()) copyFile(sourcePath, targetPath);
  }
}

function removeDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function countFiles(root) {
  let count = 0;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile()) count += 1;
    }
  }
  if (fs.existsSync(root)) walk(root);
  return count;
}

function copyRequiredFile(sourceRel, targetRel) {
  const source = path.join(home, ...sourceRel.split('/'));
  const target = path.join(payloadRoot, ...targetRel.split('/'));
  if (!fs.existsSync(source)) throw new Error(`Source file not found: ${source}`);
  copyFile(source, target);
  console.log(`copied ${sourceRel} -> payload/${targetRel}`);
}

function copyRequiredDir(sourceRel, targetRel) {
  const source = path.join(home, ...sourceRel.split('/'));
  const target = path.join(payloadRoot, ...targetRel.split('/'));
  copyDir(source, target);
  console.log(`copied ${sourceRel}/ -> payload/${targetRel}/`);
}

function main() {
  removeDir(payloadRoot);
  fs.mkdirSync(payloadRoot, { recursive: true });

  copyRequiredFile('.copilot/agents/ServiceNow Fluent.agent.md', '.copilot/agents/ServiceNow Fluent.agent.md');
  copyRequiredDir('.agents/instructions', '.agents/instructions');
  copyRequiredDir('.agents/reference', '.agents/reference');
  copyRequiredDir('.agents/tools', '.agents/tools');

  const skillsRoot = path.join(home, '.agents', 'skills');
  const targetSkillsRoot = path.join(payloadRoot, '.agents', 'skills');
  if (!fs.existsSync(skillsRoot)) throw new Error(`Skills directory not found: ${skillsRoot}`);

  const skillDirs = fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('sn-'))
    .map((entry) => entry.name)
    .sort();

  for (const skillDir of skillDirs) {
    copyDir(path.join(skillsRoot, skillDir), path.join(targetSkillsRoot, skillDir));
    console.log(`copied .agents/skills/${skillDir}/ -> payload/.agents/skills/${skillDir}/`);
  }

  const total = countFiles(payloadRoot);
  console.log(`\nPayload refreshed: ${toSlash(payloadRoot)}`);
  console.log(`Files: ${total}`);
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
}

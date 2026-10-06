'use strict';

// Read-only editorial metrics. Count prose across the WHOLE guide as well as
// the main path, so moving text to an appendix cannot masquerade as deletion.
const fs = require('node:fs');
const path = require('node:path');

function prose(markdown) {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .replace(/```[^\n]*\n[\s\S]*?```/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
}
function words(markdown) {
  return prose(markdown).split(/\s+/).filter(word => /[a-z\d]/i.test(word)).length;
}
function measureGuide(markdown) {
  const main = markdown.split(/^## Appendices:/m)[0];
  const sdk = markdown.match(/^### 2\.[^\n]*\n([\s\S]*?)(?=^### 3\.)/m)?.[1] || '';
  const totalProseWords = words(markdown);
  const mainProseWords = words(main);
  return {
    totalProseWords,
    mainProseWords,
    appendixProseWords: totalProseWords - mainProseWords,
    sdkStepProseWords: words(sdk),
    prohibitionPhrases: (prose(markdown).match(/\b(?:do not|don't|never|must not|cannot|can't|no automatic|not permitted)\b/gi) || []).length,
    powerShellBlocks: [...markdown.matchAll(/```powershell\r?\n/g)].length,
    bytes: Buffer.byteLength(markdown),
  };
}

module.exports = { prose, words, measureGuide };
if (require.main === module) {
  const files = process.argv.slice(2);
  for (const file of files.length ? files : [path.join(__dirname, '../setup.md')]) {
    console.log(JSON.stringify({ file, ...measureGuide(fs.readFileSync(file, 'utf8')) }, null, 2));
  }
}

'use strict';

// JSONC only: JSON grammar plus comments, trailing commas and one leading BOM.
// Trivia is never regenerated. Spans refer to the original UTF-16 string.
function document(text) {
  if (typeof text !== 'string') throw new TypeError('JSONC text must be a string');
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const fail = () => { throw new SyntaxError(`Invalid JSONC at offset ${pos}`); };
  function trivia() {
    for (;;) {
      while (/[ \t\r\n]/.test(text[pos] || '\0')) pos++;
      if (text.startsWith('//', pos)) {
        pos += 2;
        while (pos < text.length && !/[\r\n]/.test(text[pos])) pos++;
      } else if (text.startsWith('/*', pos)) {
        const end = text.indexOf('*/', pos + 2);
        if (end < 0) fail();
        pos = end + 2;
      } else return;
    }
  }
  function string() {
    const start = pos++;
    while (pos < text.length) {
      const ch = text[pos++];
      if (ch === '\\') pos++;
      else if (ch === '"') {
        let value;
        try { value = JSON.parse(text.slice(start, pos)); } catch { fail(); }
        return { kind: 'scalar', start, end: pos, value };
      }
    }
    fail();
  }
  function node(depth = 0) {
    if (depth > 256) throw new SyntaxError('JSONC nesting exceeds 256 levels');
    trivia();
    const start = pos;
    const ch = text[pos];
    if (ch === '"') return string();
    if (ch === '{' || ch === '[') {
      const object = ch === '{';
      const close = object ? '}' : ']';
      const value = object ? {} : [];
      const members = [];
      pos++;
      trivia();
      while (text[pos] !== close) {
        let key;
        if (object) {
          if (text[pos] !== '"') fail();
          key = string();
          trivia();
          if (text[pos++] !== ':') fail();
        }
        const child = node(depth + 1);
        const member = { node: child, comma: null };
        if (object) {
          Object.assign(member, { key: key.value, keyStart: key.start, keyEnd: key.end });
          // Unlike assignment, this treats __proto__ as an ordinary JSON key.
          Object.defineProperty(value, key.value, {
            value: child.value, enumerable: true, configurable: true, writable: true,
          });
        } else value.push(child.value);
        members.push(member);
        trivia();
        if (text[pos] === close) break;
        if (text[pos] !== ',') fail();
        member.comma = pos++;
        trivia();
      }
      pos++;
      return { kind: object ? 'object' : 'array', start, end: pos, value, members };
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(pos));
    if (!token) fail();
    pos += token[0].length;
    return { kind: 'scalar', start, end: pos, value: JSON.parse(token[0]) };
  }
  trivia();
  // Empty/comment-only settings are treated as an empty object.
  if (pos === text.length) return { kind: 'object', value: {}, members: [], empty: true };
  const root = node();
  trivia();
  if (pos !== text.length) fail();
  return root;
}

function parseJsonc(text) {
  return document(text).value;
}

function equal(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) =>
    Object.hasOwn(b, key) && equal(a[key], b[key]));
}

// Do not silently serialize undefined, holes, NaN, class instances or cycles.
function validateValue(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (!value || typeof value !== 'object') throw new TypeError('Value must be JSON-compatible');
  if (ancestors.has(value) || ancestors.size > 256) throw new TypeError('Cyclic or too deeply nested value');
  const array = Array.isArray(value);
  if (!array && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new TypeError('Value must contain only plain JSON objects');
  }
  if (Object.getOwnPropertySymbols(value).length) throw new TypeError('Symbol keys are not JSON-compatible');
  ancestors.add(value);
  if (array) {
    if (Object.keys(value).length !== value.length) throw new TypeError('Array must not have holes or extra keys');
    for (let i = 0; i < value.length; i++) {
      if (!Object.hasOwn(value, i)) throw new TypeError('Sparse arrays are not JSON-compatible');
      validateValue(value[i], ancestors);
    }
  } else {
    for (const key of Object.keys(value)) validateValue(value[key], ancestors);
  }
  ancestors.delete(value);
}

function uniqueSubtree(node) {
  const seen = new Set();
  for (const member of node.members || []) {
    if (node.kind === 'object') {
      if (seen.has(member.key)) throw new SyntaxError(`Duplicate key at edited path: ${JSON.stringify(member.key)}`);
      seen.add(member.key);
    }
    uniqueSubtree(member.node);
  }
}

/**
 * Set a nonempty array of literal string keys (dots are not path separators).
 * Missing objects are created; arrays/scalars/null in the path are rejected.
 * Duplicate keys outside the edited branch are left alone (parse uses last-wins).
 * Only the target value span and necessary insertion/comma bytes are changed.
 */
function setJsoncValue(text, keyPathArray, value) {
  if (!Array.isArray(keyPathArray) || !keyPathArray.length) {
    throw new TypeError('Key path must be a nonempty array of strings');
  }
  for (const key of keyPathArray) {
    if (typeof key !== 'string') throw new TypeError('Key path must contain only strings');
  }
  if (keyPathArray.length > 256) throw new TypeError('Key path is too deep');
  const root = document(text);
  validateValue(value);
  // Snapshot once; formatting below never serializes the caller's object again.
  value = JSON.parse(JSON.stringify(value));
  const eol = /\r\n|\n|\r/.exec(text)?.[0] || '\n';
  const unit = /(?:^|\r\n|\n|\r)([ \t]+)"/.exec(text)?.[1] || '  ';
  function lineStart(offset) {
    return Math.max(text.lastIndexOf('\n', offset - 1), text.lastIndexOf('\r', offset - 1)) + 1;
  }
  function indent(offset) {
    return /^[ \t]*/.exec(text.slice(lineStart(offset), offset))[0];
  }
  function format(item, base, multiline) {
    // JSON.stringify caps indentation at 10 characters; use a fixed sentinel
    // indentation, then expand it to the locally inferred unit.
    const json = JSON.stringify(item, null, multiline ? 1 : undefined);
    return multiline ? json.replace(/^ +/gm, (spaces) => unit.repeat(spaces.length))
      .replace(/\n/g, eol + base) : json;
  }
  function wrap(item, from) {
    for (let i = keyPathArray.length - 1; i >= from; i--) item = { [keyPathArray[i]]: item };
    return item;
  }
  if (root.empty) {
    const prefix = text && text !== '\ufeff' && !/[\r\n]$/.test(text) ? eol : '';
    return text + prefix + format(wrap(value, 0), '', true);
  }
  let object = root;
  for (let index = 0; index < keyPathArray.length; index++) {
    if (object.kind !== 'object') throw new TypeError('Non-object intermediate at edited path');
    const key = keyPathArray[index];
    const matches = object.members.filter((member) => member.key === key);
    if (matches.length > 1) throw new SyntaxError(`Duplicate key at edited path: ${JSON.stringify(key)}`);
    const member = matches[0];
    if (member) {
      if (index < keyPathArray.length - 1) {
        object = member.node;
        continue;
      }
      uniqueSubtree(member.node);
      if (equal(member.node.value, value)) return text;
      const multiline = /[\r\n]/.test(text.slice(object.start, object.end));
      return text.slice(0, member.node.start) + format(value, indent(member.keyStart), multiline)
        + text.slice(member.node.end);
    }

    const close = object.end - 1;
    const last = object.members[object.members.length - 1];
    const multiline = /[\r\n]/.test(text.slice(object.start, object.end));
    const closingStart = lineStart(close);
    const closingOnOwnLine = /^[ \t]*$/.test(text.slice(closingStart, close));
    const base = indent(close);
    const first = object.members[0];
    const ownLine = first && /^[ \t]*$/.test(text.slice(lineStart(first.keyStart), first.keyStart));
    const propertyIndent = ownLine ? indent(first.keyStart) : base + unit;
    const colon = first && /^[ \t]*:[ \t]*$/.test(text.slice(first.keyEnd, first.node.start))
      ? text.slice(first.keyEnd, first.node.start) : ': ';
    const property = JSON.stringify(key) + colon + format(wrap(value, index + 1), propertyIndent, multiline)
      + (last && last.comma !== null ? ',' : '');
    let at = close;
    let insertion;
    if (multiline && closingOnOwnLine) {
      at = closingStart;
      insertion = propertyIndent + property + eol;
    } else if (multiline) {
      insertion = eol + propertyIndent + property + eol + base;
    } else {
      const spacer = close > object.start + 1 && !/[ \t]$/.test(text.slice(0, close)) ? ' ' : '';
      insertion = spacer + property;
    }
    let result = text.slice(0, at) + insertion + text.slice(at);
    // Put the separator before trailing trivia, especially // comments.
    if (last && last.comma === null) {
      result = result.slice(0, last.node.end) + ',' + result.slice(last.node.end);
    }
    return result;
  }
}

module.exports = { parseJsonc, setJsoncValue };

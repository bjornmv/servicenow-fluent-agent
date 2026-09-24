'use strict';

const MAX_CHARS = 8000;
const MAX_FIELD_CHARS = 300;
const MAX_ROWS = 20;

// Always return valid JSON. Do not cut a serialized JSON string midway through a row.
function preview(input, { maxChars = MAX_CHARS, maxRows = 10, maxFieldChars = MAX_FIELD_CHARS } = {}) {
  maxChars = Math.max(256, Math.min(MAX_CHARS, maxChars));
  maxRows = Math.max(0, Math.min(MAX_ROWS, maxRows));
  maxFieldChars = Math.max(50, Math.min(2000, maxFieldChars));
  let shortened = Number(input?.shortened_values || 0);
  function clip(value, depth = 0) {
    if (typeof value === 'string') {
      const previous = value.match(/^(.*)…\[(\d+) chars omitted\]$/s);
      if (previous && previous[1].length <= maxFieldChars) return value;
      if (value.length <= maxFieldChars) return value;
      shortened++;
      const fullLength = previous ? previous[1].length + Number(previous[2]) : value.length;
      return value.slice(0, maxFieldChars) + `…[${fullLength - maxFieldChars} chars omitted]`;
    }
    if (value === null || typeof value !== 'object') return value;
    if (depth > 5) { shortened++; return '[nested value omitted]'; }
    if (Array.isArray(value)) {
      if (value.length > MAX_ROWS) shortened++;
      return value.slice(0, MAX_ROWS).map(v => clip(v, depth + 1));
    }
    const entries = Object.entries(value);
    if (entries.length > 50) shortened++;
    return Object.fromEntries(entries.slice(0, 50).map(([k, v]) => [k, clip(v, depth + 1)]));
  }
  const source = input && typeof input === 'object' ? input : { ok: true, result: input };
  const { records, ...meta } = source;
  const out = clip(meta);
  // Never retain a full response separately in tool details: details use this same preview.
  if (Array.isArray(records)) {
    out.records = [];
    out.returned_rows = 0;
    const previousOmissions = Number(source.truncated_rows || 0);
    out.truncated_rows = previousOmissions + records.length;
    out.shortened_values = shortened;
    const originalNext = source.nextOffset ?? null;
    function paging() {
      out.returned_rows = out.records.length;
      const omittedNow = records.length - out.records.length;
      out.truncated_rows = previousOmissions + omittedNow;
      out.shortened_values = shortened;
      if (omittedNow) {
        out.hasMore = true;
        out.nextOffset = out.records.length ? Number(source.offset || 0) + out.records.length : Number(source.offset || 0);
        out.note = 'Preview limited. Narrow fields/limit or resume at nextOffset; count is fetched rows, not a total. Nothing was exported.';
      } else {
        out.hasMore = source.hasMore ?? false;
        out.nextOffset = originalNext;
      }
    }
    for (const row of records.slice(0, maxRows)) {
      out.records.push(clip(row));
      paging();
      if (JSON.stringify(out).length > maxChars) { out.records.pop(); break; }
    }
    paging();
    while (out.records.length && JSON.stringify(out).length > maxChars) { out.records.pop(); paging(); }
  } else out.shortened_values = shortened;
  if (JSON.stringify(out).length <= maxChars) return out;
  return { ok: source.ok !== false, mode: source.mode, truncated: true,
    error: source.ok === false ? String(source.error?.message || source.error || 'Request failed').slice(0, Math.max(40, maxChars - 180)) : undefined,
    note: 'Response exceeds preview budget. Narrow the request; no full response was saved.' };
}

function createOutputBudget() {
  let turn = 16000, task = 48000;
  return {
    resetTask() { turn = 16000; task = 48000; },
    resetTurn() { turn = 16000; },
    remaining() { return Math.min(turn, task); },
    consume(input, options = {}) {
      const available = Math.min(MAX_CHARS, turn, task);
      // Small notices are permitted after the data budget; never include data in them.
      const out = available < 512
        ? { ok: false, error: 'ServiceNow output budget exhausted. Stop and summarize available evidence; ask the user before continuing.' }
        : preview(input, { ...options, maxChars: available });
      const text = JSON.stringify(out);
      turn = Math.max(0, turn - text.length);
      task = Math.max(0, task - text.length);
      return { content: [{ type: 'text', text }], details: out, isError: out.ok === false };
    }
  };
}

module.exports = { preview, createOutputBudget, MAX_CHARS, MAX_FIELD_CHARS, MAX_ROWS };

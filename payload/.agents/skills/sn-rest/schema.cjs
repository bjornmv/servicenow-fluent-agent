'use strict';

// Dependency contract: raw values, display_value=false, no reference links.
// No global/factory metadata cache: each public call gets an isolated request cache.
const DICT_FIELDS = 'name,element,column_label,internal_type,reference,choice';
const NOTE = 'Visible metadata only; ACLs and bounded reads may make results incomplete. ' +
  'An unavailable field may be absent or not readable. Metadata visibility does not grant record access.';
const ALIASES = {
  'business rules': 'sys_script', applications: 'sys_app',
  'application files': 'sys_metadata', 'script includes': 'sys_script_include',
  'catalog items': 'sc_cat_item', flows: 'sys_hub_flow', users: 'sys_user', groups: 'sys_user_group'
};
const OPS = Object.freeze({ eq: '=', ne: '!=', in: 'IN', not_in: 'NOT IN',
  contains: 'LIKE', starts_with: 'STARTSWITH', gt: '>', gte: '>=', lt: '<', lte: '<=',
  is_empty: 'ISEMPTY', is_not_empty: 'ISNOTEMPTY' });
const TEXT = new Set(['string', 'char', 'translated_text', 'translated_field', 'html',
  'url', 'email', 'phone_number', 'script', 'script_plain', 'xml', 'wide_text', 'documentation']);
const NUMBER = new Set(['integer', 'longint', 'decimal', 'float', 'currency', 'price']);
const DATE = new Set(['glide_date', 'glide_date_time', 'glide_time']);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function identifier(value, kind = 'identifier') {
  if (typeof value !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value) || value.length > 160)
    throw new Error(`Invalid ${kind}`);
  return value;
}
function fieldPath(value) {
  if (typeof value !== 'string') throw new Error('Invalid field identifier');
  const parts = value.split('.');
  if (parts.length > 4) throw new Error('Dotwalk exceeds maximum depth 3');
  parts.forEach(part => identifier(part, 'field identifier'));
  return parts;
}
function fieldList(csv) {
  if (typeof csv !== 'string' || !csv.trim()) throw new Error('fieldsCSV must be nonempty');
  const fields = [...new Set(csv.split(',').map(field => field.trim()))];
  if (fields.length > 50) throw new Error('At most 50 fields may be requested');
  fields.forEach(fieldPath);
  return fields;
}
function bounded(value, fallback, max, label) {
  value = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${label}`);
  return Math.min(value, max);
}
function safeValue(value) {
  if (!['string', 'number', 'boolean'].includes(typeof value) ||
      (typeof value === 'number' && !Number.isFinite(value))) throw new Error('Invalid filter value');
  const text = String(value);
  if (!text || /[\^\x00-\x1f\x7f-\x9f]|javascript\s*:/i.test(text))
    throw new Error('Unsafe or empty filter value; use is_empty for empty values');
  return text;
}
function unavailable(table, field) {
  const error = new Error(`Field ${table}.${field} not found OR not readable (including inherited metadata)`);
  error.code = 'FIELD_UNAVAILABLE';
  return error;
}

function createSchemaService(readRows) {
  if (typeof readRows !== 'function') throw new TypeError('readRows must be a function');

  function request() {
    const tables = new Map(), chains = new Map(), definitions = new Map();
    async function rows(table, query, fields, limit, offset = 0) {
      const result = await readRows(table, query, fields, limit, offset);
      if (!Array.isArray(result)) throw new TypeError('readRows must return an array');
      return result.slice(0, limit);
    }
    async function tableInfo(name) {
      identifier(name, 'table identifier');
      if (!tables.has(name)) tables.set(name, (async () => {
        const result = await rows('sys_db_object', `name=${name}`,
          'name,label,super_class,super_class.name', 1);
        const record = result.find(row => row.name === name);
        if (!record) throw new Error(`Table ${name} not found OR not readable`);
        const parent = record['super_class.name'] || null;
        if (parent) identifier(parent, 'parent table identifier');
        else if (record.super_class) throw new Error(`Parent of ${name} not found OR not readable`);
        return { name, label: record.label || name, parent };
      })());
      return tables.get(name);
    }
    async function lineage(table) {
      if (!chains.has(table)) chains.set(table, (async () => {
        const names = [];
        let name = table;
        while (name) {
          if (names.includes(name)) throw new Error('Cycle in table inheritance');
          if (names.length === 11) throw new Error('Maximum ancestor chain 10 exceeded');
          names.push(name);
          name = (await tableInfo(name)).parent;
        }
        return names;
      })());
      return chains.get(table);
    }
    function descriptor(row, table) {
      identifier(row.element, 'dictionary field identifier');
      if (row.reference) identifier(row.reference, 'reference table identifier');
      return { field: row.element, label: row.column_label || row.element,
        type: row.internal_type || '', ...(row.reference ? { reference: row.reference } : {}),
        defined_on: table, ...(row.choice !== undefined ? { choice: row.choice } : {}) };
    }
    async function direct(table, fields) {
      const names = await lineage(table);
      const missing = [...new Set(fields)].filter(field => !definitions.has(`${table}.${field}`));
      const found = new Map();
      if (missing.length) {
        for (const name of names) {
          const wanted = missing.filter(field => !found.has(field));
          if (!wanted.length) break;
          const result = await rows('sys_dictionary', `name=${name}^elementIN${wanted.join(',')}`,
            DICT_FIELDS, wanted.length + 1);
          const seen = new Set();
          for (const row of result) {
            if (row.name !== name || !wanted.includes(row.element)) continue;
            if (seen.has(row.element)) throw new Error(`Ambiguous dictionary metadata: ${name}.${row.element}`);
            seen.add(row.element);
            found.set(row.element, descriptor(row, name));
          }
        }
        for (const field of missing) definitions.set(`${table}.${field}`, found.get(field) || null);
      }
      return fields.map(field => definitions.get(`${table}.${field}`));
    }
    async function resolve(table, path) {
      const parts = fieldPath(path);
      let current = table, field;
      for (let i = 0; i < parts.length; i++) {
        [field] = await direct(current, [parts[i]]);
        if (!field) throw unavailable(current, parts[i]);
        if (i < parts.length - 1) {
          if (field.type !== 'reference' || !field.reference)
            throw new Error(`Cannot dotwalk non-reference field ${current}.${parts[i]}`);
          current = field.reference;
        }
      }
      return { ...field, field: path, source_table: current, source_field: parts.at(-1) };
    }
    return { rows, tableInfo, lineage, direct, resolve, descriptor };
  }

  async function search(term, limit = 5) {
    if (typeof term !== 'string' || !term.trim() || term.length > 100 ||
        !/^[a-zA-Z0-9_ -]+$/.test(term)) throw new Error('Invalid schema search term; query syntax is not allowed');
    term = term.trim();
    limit = bounded(limit, 5, 10, 'limit');
    const ctx = request();
    const alias = own(ALIASES, term.toLowerCase()) ? ALIASES[term.toLowerCase()] : null;
    const records = [];
    if (alias) {
      // Alias is a hint, never proof that a table exists or is readable.
      const match = await ctx.rows('sys_db_object', `name=${alias}`, 'name,label,super_class.name', 1);
      if (match.some(row => row.name === alias)) records.push(match.find(row => row.name === alias));
    }
    const candidates = await ctx.rows('sys_db_object', `nameLIKE${term}^ORlabelLIKE${term}^ORDERBYname`,
      'name,label,super_class.name', alias ? 19 : 20);
    const unique = new Map();
    for (const row of [...records, ...candidates]) {
      identifier(row.name, 'table identifier');
      const parent = row['super_class.name'] || null;
      if (parent) identifier(parent, 'parent table identifier');
      if (!unique.has(row.name)) unique.set(row.name, { name: row.name, label: row.label || row.name, parent });
    }
    const output = [...unique.values()].slice(0, limit);
    return { ok: true, mode: 'schema_search', records: output, count: output.length, limit,
      truncated: unique.size > limit || candidates.length === (alias ? 19 : 20), note: NOTE };
  }

  async function validateFields(table, fieldsCSV) {
    identifier(table, 'table identifier');
    const fields = fieldList(fieldsCSV), ctx = request();
    await ctx.direct(table, fields.map(field => fieldPath(field)[0]));
    const result = [];
    for (const field of fields) {
      const { source_table, source_field, ...record } = await ctx.resolve(table, field);
      result.push(record);
    }
    return result;
  }

  async function describe(table, fieldsCSV, { limit = 10, offset = 0, choices = false } = {}) {
    identifier(table, 'table identifier');
    limit = bounded(limit, 10, 50, 'limit');
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid offset');
    if (typeof choices !== 'boolean') throw new Error('choices must be boolean');
    const fields = fieldsCSV === undefined ? null : fieldList(fieldsCSV);
    if (choices && !fields) throw new Error('choices requires explicit fieldsCSV');
    const ctx = request(), names = await ctx.lineage(table);
    const records = [], missing = [];
    let hasMore = false;
    if (fields) {
      await ctx.direct(table, fields.map(field => fieldPath(field)[0]));
      const visible = [];
      for (const field of fields) {
        try { visible.push(await ctx.resolve(table, field)); }
        catch (error) {
          if (error.code !== 'FIELD_UNAVAILABLE') throw error;
          missing.push(field);
        }
      }
      records.push(...visible.slice(offset, offset + limit));
      hasMore = visible.length > offset + limit;
    } else {
      // Merge sorted per-level streams. Paginate unique visible fields, not raw
      // dictionary rows: inherited duplicates must never consume page positions.
      const size = Math.min(limit + 1, 11);
      const streams = names.map(name => ({ name, offset: 0, buffer: [], done: false }));
      async function head(stream) {
        if (!stream.buffer.length && !stream.done) {
          stream.buffer = await ctx.rows('sys_dictionary',
            `name=${stream.name}^elementISNOTEMPTY^ORDERBYelement`, DICT_FIELDS, size, stream.offset);
          stream.offset += stream.buffer.length;
          stream.done = stream.buffer.length < size;
          for (const row of stream.buffer) {
            if (row.name !== stream.name) throw new Error('Unexpected dictionary table');
            identifier(row.element, 'dictionary field identifier');
          }
        }
        return stream.buffer[0];
      }
      let position = 0;
      while (true) {
        const heads = await Promise.all(streams.map(head));
        const elements = heads.filter(Boolean).map(row => row.element).sort(compare);
        if (!elements.length) break;
        const element = elements[0];
        // Streams follow child-to-parent lineage: first matching head is the effective definition.
        // Do not issue one targeted dictionary request per skipped/displayed field.
        const nearest = heads.find(row => row?.element === element);
        const definition = ctx.descriptor(nearest, nearest.name);
        for (let i = 0; i < streams.length; i++)
          while ((await head(streams[i]))?.element === element) streams[i].buffer.shift();
        if (!definition) throw unavailable(table, element);
        if (position++ < offset) continue;
        if (records.length === limit) { hasMore = true; break; }
        records.push({ ...definition, source_table: table, source_field: element });
      }
    }
    for (const record of records) {
      if (choices) {
        const options = new Map();
        let truncated = false;
        for (const name of await ctx.lineage(record.source_table)) {
          const result = await ctx.rows('sys_choice',
            `name=${name}^element=${record.source_field}^inactive=false^ORDERBYsequence^ORDERBYvalue^ORDERBYlanguage`,
            'name,element,value,label,language,dependent_value,sequence', 11);
          if (result.length === 11) truncated = true;
          for (const row of result) {
            if (row.name !== name || row.element !== record.source_field) continue;
            const key = JSON.stringify([row.value, row.language || '', row.dependent_value || '']);
            if (!options.has(key)) options.set(key, { value: row.value, label: row.label,
              language: row.language || '', dependent_value: row.dependent_value || '', defined_on: name });
          }
        }
        record.choices = [...options.values()].slice(0, 10);
        record.choices_truncated = truncated || options.size > 10;
      }
      delete record.source_table;
      delete record.source_field;
    }
    return { ok: true, mode: 'schema', table, parent: names[1] || null, ancestors: names.slice(1),
      records, count: records.length, limit, offset, hasMore,
      nextOffset: hasMore ? offset + limit : null,
      ...(missing.length ? { missing_fields: missing } : {}),
      example: { table, fields: records[0]?.field || 'sys_id', filters: [], encodedQuery: 'sys_idISNOTEMPTY' },
      note: NOTE + (choices ? ' Choices are capped at 10 per field across visible inherited tables; ' +
        'languages/dependencies are retained, and inactive or unreadable overrides may affect effective options.' : '') };
  }

  async function compileFilters(table, filters) {
    identifier(table, 'table identifier');
    if (!Array.isArray(filters) || filters.length > 50) throw new Error('filters must be an array of at most 50 items');
    const ctx = request();
    await ctx.lineage(table);
    if (!filters.length) return 'sys_idISNOTEMPTY';
    const result = [];
    for (const filter of filters) {
      if (!filter || typeof filter !== 'object' || Array.isArray(filter) ||
          Object.keys(filter).some(key => !['field', 'operator', 'value'].includes(key)))
        throw new Error('Invalid structured filter');
      const { field, operator, value } = filter;
      fieldPath(field);
      if (!own(OPS, operator)) throw new Error(`Unsupported filter operator: ${String(operator)}`);
      const definition = await ctx.resolve(table, field);
      const type = definition.type;
      const reference = type === 'reference';
      if (reference) {
        if (!definition.reference) throw new Error(`Reference target not found OR not readable: ${field}`);
        await ctx.tableInfo(definition.reference);
      }
      const text = TEXT.has(type), number = NUMBER.has(type), date = DATE.has(type);
      if (!text && !number && !date && !reference && type !== 'boolean' && type !== 'GUID')
        throw new Error(`Unsupported field type: ${type || '(unreadable)'}`);
      if (['contains', 'starts_with'].includes(operator) && !text)
        throw new Error(`Operator ${operator} is unsupported for ${type}`);
      if (['gt', 'gte', 'lt', 'lte'].includes(operator) && !number && !date)
        throw new Error(`Operator ${operator} is unsupported for ${type}`);
      if (['is_empty', 'is_not_empty'].includes(operator)) {
        if (value !== undefined) throw new Error(`${operator} does not accept a value`);
        result.push(field + OPS[operator]);
        continue;
      }
      const list = operator === 'in' || operator === 'not_in';
      if (list && (!Array.isArray(value) || !value.length || value.length > 100))
        throw new Error('IN requires an array of 1 to 100 items');
      const values = (list ? value : [value]).map(item => {
        const scalar = safeValue(item);
        if (list && scalar.includes(',')) throw new Error('Commas are not allowed within an IN item');
        if (type === 'boolean' && !(typeof item === 'boolean' || item === 'true' || item === 'false'))
          throw new Error('Boolean fields require boolean or true/false strings');
        if (reference || type === 'GUID') {
          const global = reference && ['sys_scope', 'sys_package'].includes(definition.reference) && scalar === 'global';
          if (!global && !/^[a-f0-9]{32}$/i.test(scalar)) {
            const hint = scalar.startsWith('x_') ? '; use sys_scope.scope dotwalk or resolve sys_app.sys_id' : '';
            throw new Error(`Reference/GUID values require a 32 hex sys_id${hint}`);
          }
        }
        if (number && !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(scalar))
          throw new Error('Numeric fields require a numeric value');
        if (['integer', 'longint'].includes(type) && !/^[+-]?\d+$/.test(scalar))
          throw new Error('Integer fields require an integer value');
        if (date) {
          const patterns = { glide_date: /^\d{4}-\d{2}-\d{2}$/,
            glide_date_time: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
            glide_time: /^\d{2}:\d{2}:\d{2}$/ };
          if (!patterns[type].test(scalar)) throw new Error('Date/time values require raw ISO-shaped values');
        }
        return scalar;
      });
      result.push(field + OPS[operator] + values.join(','));
    }
    return result.join('^');
  }

  return { search, describe, validateFields, compileFilters };
}

module.exports = { createSchemaService };

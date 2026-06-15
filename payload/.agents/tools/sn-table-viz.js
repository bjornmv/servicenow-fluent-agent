#!/usr/bin/env node
/**
 * sn-table-viz.js — Visualize ServiceNow table structures as Mermaid ER diagrams.
 *
 * Usage:
 *   node sn-table-viz.js --alias <alias> --instance <url> [options]
 *
 * Options:
 *   --scope <scope>       Show tables belonging to this scope (e.g. x_kpm26_testapp006)
 *   --table <name>        Show a specific table + its parent chain + reference targets
 *   --depth <n>           Levels of parent/reference tables to follow (default 2)
 *   --out <file>          Write Mermaid diagram to file (default: stdout)
 *   --no-columns          Omit column details, show only relationships
 *   --include-sys         Include sys_* columns (excluded by default)
 */
'use strict';

const cp = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const SN_REST = path.join(os.homedir(), '.agents', 'skills', 'sn-rest', 'sn-rest.js');

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
}
function hasFlag(name) {
  return args.includes(name);
}

const ALIAS = flag('--alias');
const INSTANCE = flag('--instance');
const SCOPE = flag('--scope');
const TABLE = flag('--table');
const DEPTH = parseInt(flag('--depth') || '2', 10);
const OUT = flag('--out');
const NO_COLUMNS = hasFlag('--no-columns');
const INCLUDE_SYS = hasFlag('--include-sys');

if (!ALIAS || !INSTANCE) {
  console.error('Usage: node sn-table-viz.js --alias <alias> --instance <url> [--scope <scope>] [--table <name>] [--depth N] [--out file.md]');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// REST helper
// ---------------------------------------------------------------------------
function snGet(apiPath) {
  const result = cp.spawnSync(process.execPath, [SN_REST, '--alias', ALIAS, '--instance', INSTANCE, apiPath], {
    encoding: 'utf-8',
    timeout: 30000,
  });
  if (result.status !== 0) {
    console.error(`REST call failed: ${apiPath}\n${result.stderr || result.stdout}`);
    process.exit(1);
  }
  // strip deprecation warnings from stderr; parse stdout
  const stdout = result.stdout.trim();
  try {
    return JSON.parse(stdout);
  } catch (e) {
    // sometimes warnings leak into stdout — find the first `{`
    const idx = stdout.indexOf('{');
    if (idx > 0) return JSON.parse(stdout.substring(idx));
    throw e;
  }
}

// Paginated GET — sys_dictionary can exceed 10 000 rows for broad queries.
function snGetAll(apiPath, batchSize) {
  batchSize = batchSize || 500;
  const sep = apiPath.includes('?') ? '&' : '?';
  let offset = 0;
  let all = [];
  while (true) {
    const page = snGet(`${apiPath}${sep}sysparm_limit=${batchSize}&sysparm_offset=${offset}`);
    const rows = page.result || [];
    all = all.concat(rows);
    if (rows.length < batchSize) break;
    offset += batchSize;
  }
  return all;
}

// ---------------------------------------------------------------------------
// Data collection
// ---------------------------------------------------------------------------
const SYS_COLUMN_PREFIXES = ['sys_created', 'sys_updated', 'sys_mod_count', 'sys_class_name', 'sys_id', 'sys_tags', 'sys_domain', 'sys_domain_path', 'sys_scope'];

function isSysColumn(name) {
  return SYS_COLUMN_PREFIXES.some(p => name === p || name.startsWith(p + '.'));
}

// Collect tables to visualize
async function collectTables() {
  let seedTables = [];
  const allTablesMap = {};  // name -> { name, label, superClass, scope }

  if (SCOPE) {
    // All tables in the given scope
    console.error(`Querying tables in scope ${SCOPE}...`);
    const data = snGet(`/api/now/table/sys_db_object?sysparm_query=sys_scope.scope=${SCOPE}&sysparm_fields=name,label,super_class,sys_scope&sysparm_limit=200`);
    seedTables = (data.result || []).map(r => r.name);
    for (const r of data.result || []) {
      allTablesMap[r.name] = { name: r.name, label: r.label, superClass: r.super_class?.value || r.super_class || '', scope: SCOPE };
    }
  } else if (TABLE) {
    seedTables = [TABLE];
  } else {
    console.error('Provide --scope or --table');
    process.exit(1);
  }

  if (seedTables.length === 0) {
    console.error('No tables found.');
    process.exit(0);
  }

  // Resolve parent chain and reference targets up to DEPTH levels
  const visited = new Set(seedTables);
  let frontier = [...seedTables];
  const allColumns = {};  // tableName -> [{ element, label, type, reference, maxLength }]
  const refEdges = [];    // { from, fromCol, to, label }
  const extendsEdges = []; // { child, parent }

  for (let d = 0; d <= DEPTH && frontier.length > 0; d++) {
    // Fetch columns for frontier tables
    console.error(`Depth ${d}: querying columns for ${frontier.length} table(s)...`);

    for (const tbl of frontier) {
      const cols = snGetAll(`/api/now/table/sys_dictionary?sysparm_query=name=${tbl}^elementISNOTEMPTY^internal_type!=collection&sysparm_fields=element,column_label,internal_type,reference,max_length`);
      allColumns[tbl] = cols.map(c => ({
        element: c.element,
        label: c.column_label,
        type: flattenType(c.internal_type),
        reference: c.reference?.value || c.reference || '',
        maxLength: c.max_length,
      }));
    }

    // Resolve table metadata for frontier (if not already known)
    for (const tbl of frontier) {
      if (!allTablesMap[tbl]) {
        const meta = snGet(`/api/now/table/sys_db_object?sysparm_query=name=${tbl}&sysparm_fields=name,label,super_class,sys_scope&sysparm_limit=1`);
        const r = (meta.result || [])[0];
        if (r) {
          allTablesMap[tbl] = { name: r.name, label: r.label, superClass: r.super_class?.value || r.super_class || '', scope: '' };
        }
      }
    }

    // Find next frontier: parent tables + reference targets
    const nextFrontier = new Set();

    for (const tbl of frontier) {
      const meta = allTablesMap[tbl];
      if (meta && meta.superClass) {
        // Resolve super_class sys_id to table name
        const parentName = resolveTableName(meta.superClass, allTablesMap);
        if (parentName && !visited.has(parentName)) {
          nextFrontier.add(parentName);
        }
        if (parentName) {
          extendsEdges.push({ child: tbl, parent: parentName });
        }
      }

      // Reference columns point to other tables
      const cols = allColumns[tbl] || [];
      for (const col of cols) {
        if (col.type === 'reference' && col.reference) {
          const refTable = resolveTableName(col.reference, allTablesMap);
          if (refTable) {
            refEdges.push({ from: tbl, fromCol: col.element, to: refTable, label: col.label || col.element });
            if (!visited.has(refTable) && d < DEPTH) {
              nextFrontier.add(refTable);
            }
          }
        }
      }
    }

    for (const t of nextFrontier) visited.add(t);
    frontier = [...nextFrontier];
  }

  return { tables: visited, allTablesMap, allColumns, refEdges, extendsEdges };
}

// Resolve a sys_id (from super_class or reference) to a table name
const sysIdCache = {};
function resolveTableName(val, known) {
  // If it's already a table name in our map, return it
  for (const k of Object.keys(known)) {
    if (k === val) return val;
  }
  // It's a sys_id — look it up
  if (sysIdCache[val]) return sysIdCache[val];
  if (/^[a-f0-9]{32}$/.test(val)) {
    const data = snGet(`/api/now/table/sys_db_object?sysparm_query=sys_id=${val}&sysparm_fields=name,label,super_class&sysparm_limit=1`);
    const r = (data.result || [])[0];
    if (r) {
      sysIdCache[val] = r.name;
      known[r.name] = { name: r.name, label: r.label, superClass: r.super_class?.value || r.super_class || '', scope: '' };
      return r.name;
    }
  }
  return val; // fallback: treat as name
}

function flattenType(t) {
  if (!t) return 'string';
  if (typeof t === 'object') return t.value || 'string';
  return t;
}

// ---------------------------------------------------------------------------
// Mermaid generation
// ---------------------------------------------------------------------------
function generateMermaid(data) {
  const { tables, allTablesMap, allColumns, refEdges, extendsEdges } = data;
  const lines = ['erDiagram'];

  // Entity definitions
  for (const tbl of tables) {
    const meta = allTablesMap[tbl] || {};
    const label = meta.label || tbl;
    const mermaidId = sanitize(tbl);

    if (NO_COLUMNS) {
      lines.push(`    ${mermaidId}["${label}"] {`);
      lines.push(`    }`);
    } else {
      lines.push(`    ${mermaidId}["${label}"] {`);
      const cols = allColumns[tbl] || [];
      for (const col of cols) {
        if (!INCLUDE_SYS && isSysColumn(col.element)) continue;
        const typeName = mapType(col.type);
        const fk = col.type === 'reference' ? ' FK' : '';
        const colLabel = col.label ? ` "${col.label}"` : '';
        lines.push(`        ${typeName} ${sanitizeCol(col.element)}${fk}${colLabel}`);
      }
      lines.push(`    }`);
    }
  }

  lines.push('');

  // Inheritance relationships
  for (const e of extendsEdges) {
    if (tables.has(e.child) && tables.has(e.parent)) {
      lines.push(`    ${sanitize(e.parent)} ||--o{ ${sanitize(e.child)} : "extends"`);
    }
  }

  // Reference relationships (deduplicate)
  const seen = new Set();
  for (const e of refEdges) {
    const key = `${e.from}|${e.fromCol}|${e.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (tables.has(e.from) && tables.has(e.to)) {
      lines.push(`    ${sanitize(e.from)} }o--|| ${sanitize(e.to)} : "${e.fromCol}"`);
    }
  }

  return lines.join('\n');
}

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

function sanitizeCol(name) {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

function mapType(t) {
  const map = {
    'string': 'string',
    'integer': 'int',
    'boolean': 'bool',
    'reference': 'reference',
    'glide_date_time': 'datetime',
    'glide_date': 'date',
    'glide_list': 'list',
    'decimal': 'decimal',
    'float': 'float',
    'currency': 'currency',
    'journal': 'journal',
    'journal_input': 'journal',
    'html': 'html',
    'script': 'script',
    'script_plain': 'script',
    'conditions': 'conditions',
    'url': 'url',
    'email': 'email',
    'phone_number_e164': 'phone',
    'sys_class_name': 'classname',
    'document_id': 'docid',
    'GUID': 'guid',
    'translated_field': 'translated',
    'choice': 'choice',
    'field_name': 'fieldname',
    'table_name': 'tablename',
    'password': 'password',
    'password2': 'password2',
    'compressed': 'compressed',
    'ip_addr': 'ip',
  };
  return map[t] || t || 'string';
}

// ---------------------------------------------------------------------------
// Console summary
// ---------------------------------------------------------------------------
function printSummary(data) {
  const { tables, allTablesMap, allColumns, extendsEdges } = data;
  console.error(`\n=== Table Structure Summary ===`);
  console.error(`Tables: ${tables.size}\n`);

  for (const tbl of [...tables].sort()) {
    const meta = allTablesMap[tbl] || {};
    const parent = extendsEdges.find(e => e.child === tbl);
    const parentStr = parent ? ` (extends ${parent.parent})` : '';
    const cols = allColumns[tbl] || [];
    const colCount = INCLUDE_SYS ? cols.length : cols.filter(c => !isSysColumn(c.element)).length;
    console.error(`  ${meta.label || tbl} [${tbl}]${parentStr} — ${colCount} columns`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  const data = await collectTables();
  printSummary(data);

  const mermaid = generateMermaid(data);

  if (OUT) {
    const content = `# Table Structure\n\n\`\`\`mermaid\n${mermaid}\n\`\`\`\n`;
    fs.writeFileSync(OUT, content, 'utf-8');
    console.error(`\nDiagram written to ${OUT}`);
  } else {
    console.log(mermaid);
  }
})();

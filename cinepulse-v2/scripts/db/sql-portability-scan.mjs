#!/usr/bin/env node
/**
 * Static check for SQL that SQLite accepts but Postgres rejects. Finds every SQL string passed to
 * db().get/all/run/exec and flags:
 *   - double-quoted string values ("accepted") — identifiers in Postgres
 *   - scalar MAX(a, b) / MIN(a, b) — use GREATEST / LEAST
 *   - GROUP BY queries that select a bare column not in the GROUP BY list
 *   - SQLite-only functions (datetime, strftime, json_extract, IFNULL, GROUP_CONCAT, INSTR …)
 *   - INSERT OR IGNORE / OR REPLACE, COLLATE NOCASE, rowid
 * Usage: node scripts/db/sql-portability-scan.mjs  (exit code 1 when anything is found)
 */
import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['lib', 'app'];
const skip = new Set(['lib/db.ts']); // SQLite-only schema code lives there by design
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(p) && !skip.has(p)) files.push(p);
  }
};
roots.forEach(walk);

const checks = [
  [/=\s*"[a-z_]+"/i, 'double-quoted string value (use single quotes)'],
  [/\b(MAX|MIN)\s*\([^()]*,[^()]*\)/i, 'scalar MAX/MIN with two arguments (use GREATEST/LEAST)'],
  [/\b(datetime|strftime|julianday|json_extract|json_each|ifnull|group_concat|instr|printf|total)\s*\(/i, 'SQLite-only function'],
  [/INSERT\s+OR\s+(IGNORE|REPLACE)/i, 'INSERT OR … (use ON CONFLICT)'],
  [/COLLATE\s+NOCASE/i, 'COLLATE NOCASE (use LOWER())'],
  [/\browid\b/i, 'rowid (use the primary key)'],
];

function sqlText(node, sf) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((s) => '${…}' + s.literal.text).join('');
  return null;
}

function groupByIssues(sql) {
  const issues = [];
  const re = /SELECT\s+(DISTINCT\s+)?([\s\S]*?)\s+FROM\s[\s\S]*?GROUP\s+BY\s+([\s\S]*?)(\s+HAVING|\s+ORDER|\s+LIMIT|\)|$)/gi;
  let m;
  while ((m = re.exec(sql))) {
    const select = m[2];
    if (/\(\s*SELECT/i.test(select)) continue;
    // Outer query over a derived table: its GROUP BY belongs to the inner query.
    if (/FROM\s*\(/i.test(m[0].slice(m[0].search(/\sFROM\s/i), m[0].search(/GROUP\s+BY/i)))) continue;
    const groupCols = m[3].split(',').map((s) => s.trim().toLowerCase());
    // Postgres allows any column of a table whose primary key (alias.id) is grouped.
    const pkGrouped = new Set(groupCols.filter((g) => /^\w+\.id$/.test(g)).map((g) => g.split('.')[0]));
    let depth = 0, cur = '';
    const cols = [];
    for (const ch of select) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { cols.push(cur); cur = ''; } else cur += ch;
    }
    cols.push(cur);
    for (const raw of cols) {
      const expr = raw.trim().replace(/\s+as\s+\w+$/i, '').trim();
      if (!/^[a-z_][\w.]*$/i.test(expr)) continue; // aggregates / expressions / literals
      if (expr === '*' || /^\d/.test(expr)) continue;
      const bare = expr.toLowerCase();
      if (bare.includes('.') && pkGrouped.has(bare.split('.')[0])) continue;
      const short = bare.split('.').pop();
      if (!groupCols.some((g) => g === bare || g.split('.').pop() === short)) issues.push(`column "${expr}" is selected but not grouped`);
    }
  }
  return issues;
}

let problems = 0;
for (const file of files) {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ['get', 'all', 'run', 'exec'].includes(n.expression.name.text) && n.arguments.length) {
      const sql = sqlText(n.arguments[0], sf);
      if (sql && /\b(SELECT|INSERT|UPDATE|DELETE|CREATE)\b/i.test(sql)) {
        const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
        for (const [re, msg] of checks) if (re.test(sql)) { console.log(`${file}:${line}: ${msg}`); problems++; }
        for (const msg of groupByIssues(sql)) { console.log(`${file}:${line}: GROUP BY: ${msg}`); problems++; }
        // An output alias inside an ORDER BY / HAVING expression (Postgres allows only a bare alias).
        const aliases = [...sql.matchAll(/\bAS\s+([a-z_]\w*)/gi)].map((a) => a[1].toLowerCase());
        for (const clause of sql.matchAll(/\b(ORDER\s+BY|HAVING)\s+([\s\S]*?)(?=\bORDER\s+BY\b|\bLIMIT\b|\bOFFSET\b|\)|$)/gi)) {
          for (const term of clause[2].split(',')) {
            const t = term.trim().replace(/\s+(ASC|DESC)(\s+NULLS\s+(FIRST|LAST))?$/i, '').trim();
            if (/^[a-z_]\w*$/i.test(t)) continue; // a bare alias is fine
            for (const al of aliases) if (new RegExp(`\\b${al}\\b`, 'i').test(t) && !new RegExp(`\\.\\s*${al}\\b`, 'i').test(t)) {
              console.log(`${file}:${line}: alias "${al}" used inside an ${clause[1].toUpperCase()} expression`);
              problems++;
            }
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
console.log(problems ? `\n${problems} portability problem(s).` : 'No SQL portability problems found.');
process.exit(problems ? 1 : 0);

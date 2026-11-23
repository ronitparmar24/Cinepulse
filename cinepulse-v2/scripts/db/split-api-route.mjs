#!/usr/bin/env node
/**
 * One-off refactor: split app/api/[...path]/route.ts into lib/api/routes/<module>.ts.
 *
 * Every top-level branch of handle() starts with `if (parts[0] === '<segment>' …)`, so branches
 * for different segments are mutually exclusive. Each module receives its segments' branches in
 * their original relative order, and the dispatcher picks the module by parts[0]. Unused imports
 * are removed with the TypeScript language service's organizeImports.
 */
import ts from 'typescript';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROUTE = 'app/api/[...path]/route.ts';
const MODULES = {
  catalog: ['health', 'config', 'trailers', 'news', 'trakt', 'streaming', 'theaters', 'artwork', 'anime', 'catalog', 'genres', 'title', 'providers', 'similar', 'recommended', 'person', 'currency', 'cinema-map', 'hype-radar'],
  auth: ['auth', 'account', 'export', 'analytics'],
  library: ['library', 'community', 'reviews'],
  forecasts: ['pulse', 'my-forecasts', 'prediction', 'accuracy', 'receipts', 'leaderboard', 'score-card', 'contrarian'],
  ai: ['ai'],
  recommendations: ['recommendations', 'feedback'],
  social: ['user', 'users', 'profile', 'follows', 'likes', 'comments', 'blocks', 'feed', 'notifications', 'privacy', 'lists', 'suggestions', 'explore', 'search', 'mutes'],
  groups: ['movie-night', 'circles'],
  ops: ['cron', 'admin'],
};
const segmentToModule = Object.fromEntries(Object.entries(MODULES).flatMap(([m, segs]) => segs.map((s) => [s, m])));

const text = readFileSync(ROUTE, 'utf8');
const sf = ts.createSourceFile(ROUTE, text, ts.ScriptTarget.Latest, true);
const imports = sf.statements.filter(ts.isImportDeclaration).map((d) => d.getText(sf));
const handle = sf.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === 'handle');

const byModule = Object.fromEntries(Object.keys(MODULES).map((m) => [m, []]));
for (const st of handle.body.statements) {
  const t = st.getFullText(sf);
  const m = /^\s*(?:\/\/[^\n]*\n\s*)*if\s*\(\s*parts\[0\]\s*===\s*'([^']+)'/.exec(t);
  if (!m) continue;
  const mod = segmentToModule[m[1]];
  if (!mod) throw new Error(`No module for segment ${m[1]}`);
  byModule[mod].push(t);
}

const fixPath = (s) => s.replaceAll("'../../../lib/", "'../../").replaceAll('"../../../lib/', '"../../');
const helperNames = ['json', 'body', 'param', 'media', 'collection', 'page', 'optYear', 'optRating'];

mkdirSync('lib/api/routes', { recursive: true });
const generated = [];
for (const [mod, stmts] of Object.entries(byModule)) {
  const file = `lib/api/routes/${mod}.ts`;
  const header = `/**\n * /api/${MODULES[mod].join(', /api/')}\n * Moved verbatim from the former catch-all route; returns null when no branch matches.\n */\n`;
  const src = [
    header,
    ...imports.map(fixPath),
    `import { ${helperNames.join(', ')} } from '../http';`,
    `import type { ApiContext } from '../http';`,
    '',
    `export async function handle${mod[0].toUpperCase()}${mod.slice(1)}({ request, parts, method, query }: ApiContext): Promise<Response | null> {`,
    ...stmts.map(fixPath),
    '  return null;',
    '}',
    '',
  ].join('\n');
  writeFileSync(file, src);
  generated.push(resolve(file));
}

// Remove unused imports with the language service.
const configPath = ts.findConfigFile('.', ts.sys.fileExists, 'tsconfig.json');
const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
const versions = new Map();
const host = {
  getScriptFileNames: () => [...new Set([...parsed.fileNames, ...generated])],
  getScriptVersion: (f) => String(versions.get(f) || 0),
  getScriptSnapshot: (f) => (ts.sys.fileExists(f) ? ts.ScriptSnapshot.fromString(ts.sys.readFile(f)) : undefined),
  getCurrentDirectory: () => process.cwd(),
  getCompilationSettings: () => parsed.options,
  getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
};
const ls = ts.createLanguageService(host);
for (const f of generated) {
  const changes = ls.organizeImports({ type: 'file', fileName: f, skipDestructiveCodeActions: false }, {}, undefined);
  let out = readFileSync(f, 'utf8');
  for (const c of changes) {
    for (const tc of [...c.textChanges].sort((a, b) => b.span.start - a.span.start)) {
      out = out.slice(0, tc.span.start) + tc.newText + out.slice(tc.span.start + tc.span.length);
    }
  }
  writeFileSync(f, out);
  versions.set(f, (versions.get(f) || 0) + 1);
}
console.log('generated:', Object.entries(byModule).map(([m, s]) => `${m}(${s.length})`).join(' '));

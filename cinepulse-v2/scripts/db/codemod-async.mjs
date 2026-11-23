#!/usr/bin/env node
/**
 * Codemod step 2: propagate async after the database API became async.
 *
 * Repeats until stable:
 *  1. Every function containing `await` (TS1308) gets `async`; an explicit return type T
 *     becomes Promise<T>.
 *  2. Every call to a function converted in step 1 that isn't already awaited, returned,
 *     chained with .then/.catch, or passed to Promise.all gets `await`.
 * Callbacks made async (array methods, event handlers) are reported for manual review,
 * because e.g. `.filter(async …)` is always truthy.
 */
import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const root = resolve(process.argv[2] || '.');
const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
const fileNames = parsed.fileNames.filter((f) => !f.includes('node_modules') && !f.includes('/.next/'));

const converted = new Set(); // "file::name"
// Functions made async by hand (pass as extra CLI args: lib/db.ts::cacheGet …)
for (const seed of process.argv.slice(3)) converted.add(seed);
const callbackReports = new Set();

function isFunctionLike(n) {
  return ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n);
}
function fnName(n) {
  if (n.name && ts.isIdentifier(n.name)) return n.name.text;
  if (n.name && ts.isPrivateIdentifier?.(n.name)) return n.name.text;
  const p = n.parent;
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  if (p && ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) return p.name.text;
  return null;
}
function findNode(sf, pos) {
  let found;
  (function visit(n) {
    if (pos >= n.getStart(sf) && pos < n.getEnd()) {
      found = n;
      ts.forEachChild(n, visit);
    }
  })(sf);
  return found;
}
function enclosingFunction(n) {
  let p = n.parent;
  while (p && !isFunctionLike(p)) p = p.parent;
  return p;
}
function isPromiseTypeNode(t) {
  return t && ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName) && t.typeName.text === 'Promise';
}

function applyEdits(file, edits) {
  let text = readFileSync(file, 'utf8');
  edits.sort((a, b) => b.pos - a.pos);
  const seen = new Set();
  for (const e of edits) {
    const key = `${e.pos}:${e.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    text = text.slice(0, e.pos) + e.text + text.slice(e.end ?? e.pos);
  }
  writeFileSync(file, text);
}

function makeAsyncEdits(fn, sf, edits) {
  if (fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) return false;
  let pos;
  if (ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn)) {
    const kw = fn.getChildren(sf).find((c) => c.kind === ts.SyntaxKind.FunctionKeyword);
    pos = kw.getStart(sf);
  } else if (ts.isMethodDeclaration(fn)) {
    pos = fn.name.getStart(sf);
  } else {
    pos = fn.getStart(sf);
  }
  edits.push({ pos, text: 'async ' });
  if (fn.type && !isPromiseTypeNode(fn.type)) {
    edits.push({ pos: fn.type.getStart(sf), text: 'Promise<' });
    edits.push({ pos: fn.type.getEnd(), text: '>' });
  }
  const name = fnName(fn);
  if (name) converted.add(`${relative(root, sf.fileName)}::${name}`);
  if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) {
    const p = fn.parent;
    if (p && ts.isCallExpression(p)) {
      const callee = p.expression.getText(sf);
      const line = sf.getLineAndCharacterOfPosition(fn.getStart(sf)).line + 1;
      callbackReports.add(`${relative(root, sf.fileName)}:${line}: async callback passed to ${callee}()`);
    } else if (p && ts.isJsxExpression(p)) {
      const line = sf.getLineAndCharacterOfPosition(fn.getStart(sf)).line + 1;
      callbackReports.add(`${relative(root, sf.fileName)}:${line}: async JSX handler`);
    }
  }
  return true;
}

function calleeKey(checker, call, sf) {
  const sig = checker.getResolvedSignature(call);
  const decl = sig?.declaration;
  if (!decl || !isFunctionLike(decl)) return null;
  const dsf = decl.getSourceFile();
  if (dsf.fileName.includes('node_modules')) return null;
  const name = fnName(decl);
  return name ? `${relative(root, dsf.fileName)}::${name}` : null;
}

function alreadyHandled(call) {
  let n = call;
  // climb through parentheses / non-null / type assertions
  while (n.parent && (ts.isParenthesizedExpression(n.parent) || ts.isNonNullExpression(n.parent) || ts.isAsExpression(n.parent))) n = n.parent;
  const p = n.parent;
  if (!p) return false;
  if (ts.isAwaitExpression(p) || ts.isReturnStatement(p) || ts.isVoidExpression(p)) return true;
  if (ts.isArrowFunction(p) && p.body === n) return true; // concise arrow body returns it
  if (ts.isPropertyAccessExpression(p) && ['then', 'catch', 'finally'].includes(p.name.text)) return true;
  if (ts.isArrayLiteralExpression(p)) return true; // likely Promise.all([...])
  if (ts.isCallExpression(p) && /Promise\.(all|allSettled|race|any)$/.test(p.expression.getText())) return true;
  return false;
}

let round = 0;
while (round < 40) {
  round += 1;
  const program = ts.createProgram(fileNames, parsed.options);
  const checker = program.getTypeChecker();
  const editsByFile = new Map();
  const add = (file, e) => { if (!editsByFile.has(file)) editsByFile.set(file, []); editsByFile.get(file).push(e); };

  // 1. await outside async
  let awaitErrors = 0;
  const diags = ts.getPreEmitDiagnostics(program).filter((d) => d.code === 1308 && d.file && fileNames.includes(d.file.fileName));
  const doneFns = new Set();
  for (const d of diags) {
    const sf = d.file;
    const node = findNode(sf, d.start);
    const fn = node && enclosingFunction(node);
    if (!fn || doneFns.has(fn)) continue;
    doneFns.add(fn);
    const edits = [];
    if (makeAsyncEdits(fn, sf, edits)) { edits.forEach((e) => add(sf.fileName, e)); awaitErrors += 1; }
  }

  // 2. un-awaited calls to converted functions
  let awaitsAdded = 0;
  if (awaitErrors === 0) {
    for (const sf of program.getSourceFiles()) {
      if (!fileNames.includes(sf.fileName)) continue;
      const visit = (n) => {
        if (ts.isCallExpression(n)) {
          const key = calleeKey(checker, n, sf);
          if (key && converted.has(key) && !alreadyHandled(n)) {
            add(sf.fileName, { pos: n.getStart(sf), text: '(await ' });
            add(sf.fileName, { pos: n.getEnd(), text: ')' });
            awaitsAdded += 1;
          }
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
  }

  for (const [file, edits] of editsByFile) applyEdits(file, edits);
  console.log(`round ${round}: made ${awaitErrors} functions async, added ${awaitsAdded} awaits`);
  if (awaitErrors === 0 && awaitsAdded === 0) break;
}

console.log(`\nconverted ${converted.size} functions`);
writeFileSync('/tmp/claude-0/converted-functions.txt', [...converted].sort().join('\n') + '\n');
console.log('\nCallbacks made async (review each):');
for (const r of [...callbackReports].sort()) console.log('  ' + r);

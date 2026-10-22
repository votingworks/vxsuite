#!/usr/bin/env node
// Codemod: user-event v13 -> v14. Awaits every `userEvent.*()` call, makes
// enclosing functions async, and awaits calls to those functions transitively
// (across files and packages, via the type checker). Also switches to the named
// `userEvent` import and renames v13 key descriptors (`{enter}` -> `{Enter}`,
// `{selectall}` -> Ctrl+A).
// Usage: node user-event-codemod.cjs <package-dir>... (dependencies first)
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const REPO_ROOT = path.resolve(__dirname);
const NON_PROPAGATING_CALLEES =
  /^(it|test|describe|beforeEach|afterEach|beforeAll|afterAll|waitFor|vi\.waitFor|fc)(\.\w+)*$/;
const KEY_NAMES = {
  enter: 'Enter',
  backspace: 'Backspace',
  esc: 'Escape',
  escape: 'Escape',
  del: 'Delete',
  delete: 'Delete',
  tab: 'Tab',
  space: ' ',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  shift: 'Shift',
  ctrl: 'Control',
  alt: 'Alt',
  meta: 'Meta',
};

/** Keys of exported functions made async, as `<src path sans ext>#<name>`. */
const asyncExportKeys = new Set();
const stats = { awaits: 0, asyncified: 0, imports: 0, keys: 0, warnings: [] };

function isFnLike(n) {
  return (
    ts.isArrowFunction(n) ||
    ts.isFunctionExpression(n) ||
    ts.isFunctionDeclaration(n) ||
    ts.isMethodDeclaration(n)
  );
}

function isAsync(fn) {
  return (ts.getCombinedModifierFlags(fn) & ts.ModifierFlags.Async) !== 0;
}

function enclosingFn(node) {
  let p = node.parent;
  while (p && !isFnLike(p)) p = p.parent;
  return p;
}

function where(node) {
  const sf = node.getSourceFile();
  const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  return `${path.relative(REPO_ROOT, sf.fileName)}:${line + 1}`;
}

function isUserEventCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'userEvent'
  );
}

function sourceKey(fileName, name) {
  const rel = path.relative(REPO_ROOT, fileName);
  const src = rel
    .replace(/(^|\/)build\//, '$1src/')
    .replace(/\.d\.ts$/, '')
    .replace(/\.tsx?$/, '');
  return `${src}#${name}`;
}

function exportKey(fn) {
  const decl = ts.isVariableDeclaration(fn.parent) ? fn.parent : fn;
  const stmt = ts.isVariableDeclaration(decl) ? decl.parent.parent : decl;
  if (!decl.name || !ts.isIdentifier(decl.name)) return undefined;
  if (!ts.isSourceFile(stmt.parent)) return undefined;
  return sourceKey(fn.getSourceFile().fileName, decl.name.text);
}

function loadProgram(pkgDir) {
  const configPath = path.join(pkgDir, 'tsconfig.json');
  const config = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} }
  );
  return ts.createProgram(config.fileNames, config.options);
}

function processPackage(pkgDir) {
  const program = loadProgram(pkgDir);
  const checker = program.getTypeChecker();
  const files = program
    .getSourceFiles()
    .filter(
      (sf) =>
        !sf.isDeclarationFile &&
        sf.fileName.startsWith(`${pkgDir}/`) &&
        !sf.fileName.includes('/node_modules/')
    );

  const asyncFns = new Set();
  const awaitCalls = new Set();
  const calls = [];

  function markAwait(call) {
    if (awaitCalls.has(call)) return false;
    awaitCalls.add(call);
    const fn = enclosingFn(call);
    if (!fn) {
      stats.warnings.push(`${where(call)}: awaited call outside any function`);
    } else if (!isAsync(fn)) {
      asyncFns.add(fn);
    }
    return true;
  }

  function resolveFn(call) {
    let symbol = checker.getSymbolAtLocation(call.expression);
    if (!symbol) return undefined;
    if (symbol.flags & ts.SymbolFlags.Alias) {
      symbol = checker.getAliasedSymbol(symbol);
    }
    const decl = symbol.declarations?.[0];
    if (!decl) return undefined;
    if (decl.getSourceFile().isDeclarationFile) {
      return { key: sourceKey(decl.getSourceFile().fileName, symbol.name) };
    }
    if (isFnLike(decl)) return { fn: decl };
    if (
      ts.isVariableDeclaration(decl) &&
      decl.initializer &&
      isFnLike(decl.initializer)
    ) {
      return { fn: decl.initializer };
    }
    return undefined;
  }

  for (const sf of files) {
    (function visit(node) {
      if (ts.isCallExpression(node)) calls.push(node);
      ts.forEachChild(node, visit);
    })(sf);
  }

  for (const call of calls) {
    if (isUserEventCall(call) && !ts.isAwaitExpression(call.parent)) {
      markAwait(call);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const call of calls) {
      if (ts.isAwaitExpression(call.parent) || awaitCalls.has(call)) continue;
      const target = resolveFn(call);
      const becameAsync =
        (target?.fn && asyncFns.has(target.fn)) ||
        (target?.key && asyncExportKeys.has(target.key));
      const asyncCallback = call.arguments.some(
        (arg) => isFnLike(arg) && asyncFns.has(arg)
      );
      if (
        becameAsync ||
        (asyncCallback &&
          !NON_PROPAGATING_CALLEES.test(call.expression.getText()) &&
          !ts.isCallExpression(call.expression))
      ) {
        changed = markAwait(call) || changed;
      }
    }
  }

  for (const fn of asyncFns) {
    const key = exportKey(fn);
    if (key) asyncExportKeys.add(key);
    const par = fn.parent;
    if (ts.isCallExpression(par) && par.arguments.includes(fn)) {
      const callee = par.expression.getText();
      if (/\.(forEach|map|filter|reduce)$|^fc\./.test(callee)) {
        stats.warnings.push(`${where(fn)}: async callback passed to ${callee}`);
      }
    }
  }

  for (const sf of files) {
    const edits = [];
    const text = sf.getFullText();

    for (const call of awaitCalls) {
      if (call.getSourceFile() !== sf) continue;
      const needsParens =
        (ts.isPropertyAccessExpression(call.parent) ||
          ts.isElementAccessExpression(call.parent) ||
          ts.isNonNullExpression(call.parent)) &&
        call.parent.expression === call;
      edits.push({
        pos: call.getStart(sf),
        text: needsParens ? '(await ' : 'await ',
      });
      if (needsParens) edits.push({ pos: call.getEnd(), text: ')' });
      stats.awaits++;
    }

    for (const fn of asyncFns) {
      if (fn.getSourceFile() !== sf) continue;
      let pos;
      if (ts.isArrowFunction(fn)) {
        pos = fn.getStart(sf);
      } else if (ts.isMethodDeclaration(fn)) {
        pos = fn.name.getStart(sf);
      } else {
        const kw = fn
          .getChildren(sf)
          .find((c) => c.kind === ts.SyntaxKind.FunctionKeyword);
        pos = kw.getStart(sf);
      }
      edits.push({ pos, text: 'async ' });
      if (fn.type && !/^Promise</.test(fn.type.getText(sf))) {
        edits.push({ pos: fn.type.getStart(sf), text: 'Promise<' });
        edits.push({ pos: fn.type.getEnd(), text: '>' });
      }
      stats.asyncified++;
    }

    (function visit(node) {
      if (
        ts.isImportDeclaration(node) &&
        node.moduleSpecifier.text === '@testing-library/user-event' &&
        node.importClause?.name?.text === 'userEvent' &&
        !node.importClause.namedBindings
      ) {
        const name = node.importClause.name;
        edits.push({ pos: name.getStart(sf), text: '{ ' });
        edits.push({ pos: name.getEnd(), text: ' }' });
        stats.imports++;
      }
      if (isUserEventCall(node)) {
        const method = node.expression.name.text;
        const arg = node.arguments[method === 'type' ? 1 : 0];
        if (
          (method === 'type' || method === 'keyboard') &&
          arg &&
          (ts.isStringLiteralLike(arg) || ts.isTemplateExpression(arg))
        ) {
          const re = /\{(\/?)([a-z]+)(>?)\}/g;
          const argText = arg.getText(sf);
          for (const m of argText.matchAll(re)) {
            const [whole, close, name, hold] = m;
            const key = KEY_NAMES[name];
            if (!key && name !== 'selectall') continue;
            const replacement =
              name === 'selectall'
                ? '{Control>}a{/Control}'
                : key === ' '
                  ? ' '
                  : `{${close}${key}${hold}}`;
            const pos = arg.getStart(sf) + m.index;
            edits.push({ pos, text: replacement, deleteLength: whole.length });
            stats.keys++;
          }
        }
      }
      ts.forEachChild(node, visit);
    })(sf);

    if (!edits.length) continue;
    edits.sort((a, b) => b.pos - a.pos);
    let out = text;
    for (const e of edits) {
      out =
        out.slice(0, e.pos) + e.text + out.slice(e.pos + (e.deleteLength ?? 0));
    }
    fs.writeFileSync(sf.fileName, out);
  }
}

for (const dir of process.argv.slice(2)) {
  processPackage(path.resolve(dir));
}
console.log(JSON.stringify(stats, null, 2));

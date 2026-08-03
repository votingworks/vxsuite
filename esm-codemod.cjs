#!/usr/bin/env node
// ESM codemod for a single package. Two transforms:
//   1. Add explicit extensions to relative import/export specifiers. Covers
//      `from '...'`, bare `import '...'`, and dynamic/type-position `import('...')`
//      (including `typeof import('...')`). Directory targets (foo/ with index.ts)
//      become foo/index.js; files become foo.js. Bare `'.'`/`'..'` (a directory
//      self/parent reference) become `'./index.js'`/`'../index.js'`.
//   2. Replace CJS module globals with ESM equivalents:
//      __dirname  -> import.meta.dirname   (node >= 20.11)
//      __filename -> import.meta.filename  (node >= 20.11)
// It also flips the package's `package.json` to ESM: adds `"type": "module"` and an
// `exports` map, and removes the now-redundant `main`/`types` fields.
//
// Run this only on a package you are converting to `"type": "module"`.
//
// Usage: node esm-codemod.cjs <packageDir>
//
// <packageDir> must contain a package.json. The set of files to rewrite is the
// union of what the package's `tsconfig.json` and `tsconfig.build.json` compile
// (so both sources and tests are covered). Rather than reimplement tsc's config
// resolution (`extends` chains, glob expansion, include/exclude, defaults), we ask
// tsc for the answer via `tsc -p <config> --showConfig`, whose `files` array is the
// fully-resolved input list.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const pkgDir = path.resolve(process.argv[2] || '');
if (!process.argv[2]) {
  throw new Error('usage: esm-codemod.cjs <packageDir>');
}
if (!fs.existsSync(path.join(pkgDir, 'package.json'))) {
  throw new Error(`no package.json found in ${pkgDir}`);
}

// --- file discovery via `tsc --showConfig` -----------------------------------

/** Find the nearest `node_modules/.bin/tsc`, walking up from `start`. */
function findTsc(start) {
  for (let dir = start; ; dir = path.dirname(dir)) {
    const bin = path.join(dir, 'node_modules', '.bin', 'tsc');
    if (fs.existsSync(bin)) return bin;
    if (dir === path.dirname(dir)) {
      throw new Error(`could not find a tsc binary above ${start}`);
    }
  }
}

const tsc = findTsc(pkgDir);

/** The absolute input files a single tsconfig compiles, per `tsc --showConfig`. */
function filesForConfig(configPath) {
  let stdout;
  try {
    stdout = execFileSync(tsc, ['-p', configPath, '--showConfig'], {
      cwd: pkgDir,
      encoding: 'utf8',
    });
  } catch (error) {
    throw new Error(
      `tsc --showConfig failed for ${configPath}:\n${error.stderr || error.message}`
    );
  }
  const { files = [] } = JSON.parse(stdout);
  // `files` entries are relative to the config file's directory (the package dir).
  return files.map((f) => path.resolve(pkgDir, f));
}

// --- specifier + globals rewrite ---------------------------------------------

// Matches the `'<spec>'` in `from '<spec>'`, bare `import '<spec>'`, and
// `import('<spec>')` (dynamic import and `typeof import(...)` type queries).
// The spec is either a `./`-prefixed path or a bare `.`/`..` directory reference
// (the trailing `\2` anchors the bare form to the closing quote, so `'.foo'` and
// package names starting with a dot are not mistaken for it).
const SPEC_RE =
  /(\bfrom\s*|\bimport\s*\(\s*|(?:\bimport|\bexport)\s+)(['"])(\.\.?\/[^'"]*|\.\.?)\2/g;

let filesChanged = 0;
let importsRewritten = 0;
let globalsRewritten = 0;

function rewrite(file) {
  const dir = path.dirname(file);
  const before = fs.readFileSync(file, 'utf8');
  let after = before.replace(SPEC_RE, (match, prefix, quote, spec) => {
    // Skip if it already has a recognized extension.
    if (/\.(js|json|css|node)$/.test(spec)) return match;
    const target = path.resolve(dir, spec);
    let resolved;
    // Check for a sibling file first: Node resolves an extensionless specifier to
    // `foo.ts` before `foo/index.ts` when both a file and a same-named directory
    // exist (e.g. a `types.ts` module beside a `types/` dir of ambient `.d.ts`s).
    if (fs.existsSync(`${target}.ts`) || fs.existsSync(`${target}.tsx`)) {
      resolved = `${spec}.js`;
    } else if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      resolved = `${spec}/index.js`;
    } else {
      // Unknown (e.g. resolves to a .js already on disk, or a type-only path) — leave it.
      return match;
    }
    importsRewritten += 1;
    return `${prefix}${quote}${resolved}${quote}`;
  });

  after = after.replace(/\b__dirname\b/g, () => {
    globalsRewritten += 1;
    return 'import.meta.dirname';
  });
  after = after.replace(/\b__filename\b/g, () => {
    globalsRewritten += 1;
    return 'import.meta.filename';
  });

  if (after !== before) {
    fs.writeFileSync(file, after);
    filesChanged += 1;
  }
}

// --- package.json flip to ESM ------------------------------------------------

// Adds `"type": "module"` and an `exports` map, and drops `main`/`types`. The
// `exports` paths derive from `main` (so the `.d.ts` is correct even where a
// package's `types` field is stale). `type`/`exports` are placed where the removed
// `main`/`types` sat, so the diff stays local. A pre-existing `exports` value is
// preserved (only repositioned). Idempotent: an already-converted package.json
// re-derives to the same text and is left untouched.
function updatePackageJson() {
  const pkgPath = path.join(pkgDir, 'package.json');
  const raw = fs.readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(raw);

  // Only a library (something imports it) needs an `exports` map. Synthesize one
  // from `main` when present; an app with no `main`/`exports` (e.g. a Vite
  // frontend, which is never imported as a package) just gets `"type": "module"`.
  const esmFields = [['type', 'module']];
  if (pkg.main != null || pkg.exports != null) {
    const entryJs = `./${String(pkg.main || 'build/index.js').replace(/^\.\//, '')}`;
    const entryDts = entryJs.replace(/\.js$/, '.d.ts');
    esmFields.push([
      'exports',
      pkg.exports ?? { '.': { types: entryDts, default: entryJs } },
    ]);
  }
  const drop = new Set(['main', 'types', 'type', 'exports']);

  const out = [];
  let inserted = false;
  for (const entry of Object.entries(pkg)) {
    if (drop.has(entry[0])) {
      if (!inserted) {
        out.push(...esmFields);
        inserted = true;
      }
      continue;
    }
    out.push(entry);
  }
  if (!inserted) {
    // Nothing to anchor on — place the ESM fields after the header fields.
    const headers = new Set(['name', 'version', 'private', 'license']);
    let at = 0;
    for (let i = 0; i < out.length; i += 1) {
      if (headers.has(out[i][0])) at = i + 1;
    }
    out.splice(at, 0, ...esmFields);
  }

  const next = `${JSON.stringify(Object.fromEntries(out), null, 2)}\n`;
  if (next === raw) return null;
  fs.writeFileSync(pkgPath, next);
  const added = esmFields.map(([k]) => k).join(' + ');
  const removed = ['main', 'types'].filter((k) => k in pkg);
  return `added ${added}${removed.length ? `, removed ${removed.join('/')}` : ''}`;
}

// --- main ---------------------------------------------------------------------

const configNames = ['tsconfig.json', 'tsconfig.build.json'];
const configs = configNames
  .map((name) => path.join(pkgDir, name))
  .filter((p) => fs.existsSync(p));
if (configs.length === 0) {
  throw new Error(`no ${configNames.join(' or ')} found in ${pkgDir}`);
}

const targets = new Set();
for (const configPath of configs) {
  const files = filesForConfig(configPath);
  console.log(`${path.basename(configPath)}: ${files.length} files`);
  for (const file of files) targets.add(file);
}

for (const file of targets) rewrite(file);

const pkgJsonChange = updatePackageJson();

// Warn about CJS `.js` files at the package root (config files like
// `.stylelintrc.js`, `.lintstagedrc.js`) that tsc doesn't compile and so aren't in
// `targets`. Under `"type": "module"` node reads them as ESM and they crash with
// `require is not defined`. They must be renamed to `.cjs` (their tools resolve
// `.cjs` automatically). This only warns — the correct rename may require updating
// references (e.g. a `--config` path), so it's left to the human.
const cjsConfigs = fs
  .readdirSync(pkgDir, { withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith('.js') && !targets.has(path.join(pkgDir, e.name)))
  .map((e) => e.name)
  .filter((name) => {
    const text = fs.readFileSync(path.join(pkgDir, name), 'utf8');
    return /\bmodule\.exports\b|\brequire\(/.test(text);
  });

console.log(
  `rewrote ${importsRewritten} specifiers + ${globalsRewritten} CJS globals across ${filesChanged} of ${targets.size} files`
);
console.log(
  pkgJsonChange
    ? `package.json: flipped to ESM (${pkgJsonChange})`
    : 'package.json: already ESM, unchanged'
);
if (cjsConfigs.length > 0) {
  console.log(
    `\n⚠  CJS config file(s) at the package root will break as ESM — rename to .cjs:\n` +
      cjsConfigs.map((name) => `     ${name} → ${name.slice(0, -3)}.cjs`).join('\n')
  );
}

# VxSuite ESM Migration

**Author:** @eventualbuddha

**Status:** `planning`

## Problem

VxSuite is a monorepo of mostly-TypeScript packages. Each package's `tsc` build
turns its `.ts` files into `.js`/`.d.ts` pairs, generally from the `src`
directory to the `build` directory. We write ES module syntax
(`import`/`export`) in our `.ts` files, but `tsc` compiles those declarations
down into `require` calls and `exports` object updates — CommonJS (CJS), the
previous module system in the NodeJS ecosystem.

Over the years NodeJS has gained support for running ES module (ESM)
declarations directly, and the NPM ecosystem is moving increasingly toward that
future. That has forced us to hold back on upgrades to modules that ship
ESM-only, since older NodeJS could not `require` an ESM package. During the
NodeJS v20 cycle it can now load ESM from CJS, so that is no longer as much of
an issue — but we still emit CJS everywhere. We'd like to fully move from CJS to
native ESM output, and on our current NodeJS (v20.19.0) we can.

## Proposal

Convert every workspace package from CJS output to native ESM output,
incrementally and top-down (apps first), one wave per PR. Every intermediate
state type-checks and runs, so the work can be paced over many PRs rather than
landing all at once.

### Interoperability

Determining how ESM and CJS interoperate tells us how the migration can go:
all-at-once, top-down incremental, bottom-up incremental, or any order. Two
processors matter, and they don't agree.

At **runtime**, I tested the interoperability story and found that ESM and CJS
can each load the other (and, obviously, their own kind) on v20.19. So NodeJS
alone would permit any order.

**`tsc`** is stricter. Under `"moduleResolution": "node16"`, a CJS package fails
to compile against an ESM dependency: a CJS `import` becomes a `require`, and
`tsc` won't allow a `require` to resolve ESM. This means transforming a leaf
before its dependents fails unless we switch to `"moduleResolution": "bundler"`.
But `tsc` fails for a reason worth keeping: if we're not bundling, we've
deferred cross-module linking to runtime, so an import that appears to work
statically might fail dynamically.

### Migration strategy

We could adopt `bundler` resolution and silence the errors, but that only buys
us a bottom-up migration while trading a real compile-time signal for a runtime
risk. Top-down incremental is already available to us under `node16` without
giving anything up, so we take that: **start with the apps and work down.** Once
every importer of a given package is itself ESM (`type: module`), that package
can be migrated.

### The nitty-gritty

Each package that exports TS code for another package to run — backends and
libraries — follows a pattern like this:

1. Mark the package as ESM by adding `"type": "module"` to `package.json`. A
   library also gets an `exports` map (and drops the now-redundant
   `main`/`types`); an app that nothing imports just gets `"type": "module"`.
2. Give relative imports the extension of the built file
   (`import { foo } from './foo.js'`) and reference `index.js` files explicitly
   instead of the directories that contain them.
3. `__dirname` and `__filename` don't exist in ESM; use `import.meta.dirname`
   and `import.meta.filename` (NodeJS ≥ 20.11).
4. `export =` becomes a named or default export.
5. `import x = require(...)` becomes `import x from ...`.
6. `require.resolve` becomes `import.meta.resolve` or `createRequire`.
7. Bare `require(...)` is evaluated case-by-case.
8. JSON imports get `with { type: 'json' }`.

The vast majority of changes are 1–3, all handled by a codemod (it derives each
package's file set from its tsconfigs, rewrites the specifiers and module
globals, and flips `package.json`). Items 4–8 are a couple dozen manual sites
across the whole repo. Packages with native components or that are just type
shims overlap with the above but need some special handling — for example, a CJS
`.d.ts` shim should use `export =` to match its `module.exports` runtime.

One non-obvious gotcha: config files written as CJS `.js` (e.g.
`.stylelintrc.js`, `.lintstagedrc.js`) break once `type: module` makes NodeJS
read them as ESM. Rename them to `.cjs`. They live outside any tsconfig, so
`tsc` never flags them — a backend's `.lintstagedrc.js` only fails at commit
time.

### Frontends

Frontends are a little different. They're bundled by Vite, never run directly by
NodeJS and never imported as a package, and they have no `tsconfig.build.json`.
For them we use the bundled module resolution strategy
(`"moduleResolution": "bundler"`) instead of `node16` — the bundler is the real
resolver, so this both matches reality and eases the strict interoperability
node otherwise requires (e.g. default-importing a CJS package like
`styled-components`). The codemod still applies, minus the `exports` map. A
CRA-era dev proxy should move to Vite's native `server.proxy`.

## Validation

A package isn't done until several independent module-resolution and
export-specifier processors are all satisfied, and they don't necessarily agree:

- **`tsc`** and **eslint** are happy. Run the full type-check, not just the
  build — `tsconfig.build.json` excludes test files, so a build-only check
  misses ESM problems in tests.
- **NodeJS** resolves the emitted ESM and CJS specifiers when running the
  _built_ output — not just under vitest. vitest's transform is more forgiving
  than node's loader; most notably, node's CJS export detection can fail to
  recognize a named export that vitest handles fine, so
  `import { x } from 'somecjs'` type-checks and tests green yet crashes at
  runtime. The fix is to default-import the module and read the member off it.
  This class of bug only surfaces by running the built output under `node`.
- **vitest** tests pass.

## Alternatives Considered

**Bottom-up with `moduleResolution: bundler`.** Converting leaves first requires
silencing the `tsc` error by switching node-run packages to `bundler`
resolution. That models a bundler we don't have for backends and libraries and
defers cross-module linking to runtime, turning a true compile-time signal into
a latent runtime failure. Since top-down is available without that cost, we
prefer it. (`bundler` _is_ correct for frontends, which really are bundled.)

**All-at-once.** A flag-day conversion sidesteps mixed-state interop entirely,
but forfeits the ability to pace the work, review it in small pieces, and keep
`main` shippable throughout. Because incremental conversion is safe here,
there's no reason to take on that risk.

## Open Questions

- Native-addon and type-shim packages need case-by-case handling the codemod
  doesn't fully cover; each should be spot-checked by running its built output
  under `node` before its consumers convert.
- Reworking build orchestration (dropping `composite`/`references`, or adopting
  a task runner) is a natural companion but is out of scope here and can proceed
  on its own track.

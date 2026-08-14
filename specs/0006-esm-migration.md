# VxSuite ESM Migration

**Author:** @eventualbuddha

**Status:** `implementing`

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
   `main`/`types`), including a `"./package.json"` entry; an app that nothing
   imports just gets `"type": "module"`.
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
time. Two variations came up in practice. Some tools only look for a `.js`
config and would never find a `.cjs` one — i18next-parser searches for
`i18next-parser.config.{js,mjs,json,ts,yaml,yml}` — so that config has to become
ESM (`export default`) rather than be renamed. And a whole directory that must
stay CJS can get its own `package.json` containing `{ "type": "commonjs" }`,
which is how VxDesign's node-pg-migrate migrations keep working: the runner
loads them with `require`, and renaming 50 files would have tripped the
migration-immutability guard that tracks them by name.

That directory `package.json` is then a new file in a directory some tool
enumerates, and it may not be ignored. node-pg-migrate's default ignore pattern
only skips dotfiles, so it loaded `migrations/package.json` as a migration named
`package` with timestamp `0`, which sorts ahead of every real migration and
makes its `checkOrder` check throw. Tests stayed green because the programmatic
runner in `src/db/client.ts` already passed an `ignorePattern`; it was the CLI
invocations in `package.json` scripts that broke, and with them the Heroku
release phase that runs `db:migrations:run`. Whenever this trick is used, pass
the ignore pattern everywhere the tool is invoked, not just where it was already
needed.

### The `exports` map and the tooling that reads `package.json`

Step 1 changes the shape of a library's `package.json`: it gains an `exports`
map and loses `main`. Both halves of that break tooling, in ways no build,
type-check or test notices.

- **An `exports` map turns off extension-adding and unlisted subpaths.**
  `prod-build` walks the workspace dependency graph with
  ``resolveFrom(path, `${name}/package`)`` and relies on NodeJS adding `.json`.
  Against a converted package that resolution fails with
  `ERR_PACKAGE_PATH_NOT_EXPORTED`, so building any app for production dies at
  the first converted dependency. Two changes are needed and neither works
  alone: ask for `${name}/package.json`, since an exports map matches subpaths
  exactly, and declare `"./package.json": "./package.json"` in the map so that
  subpath resolves at all. Exporting `./package.json` is conventional and worth
  having regardless — reading `<pkg>/package.json` is a common thing for tooling
  to do. The codemod emits the subpath and `validate-monorepo` enforces it,
  because otherwise every remaining library reintroduces the problem as it
  converts and only prod-build, which CI never runs, would notice.
- **Tooling that sniffs `main`/`module` stops recognizing converted packages.**
  `getWorkspacePackageInfo()` decided a workspace package was a library — and so
  should be aliased to its TypeScript source in the app Vite configs — by
  checking `main`/`module`, so the batch-1 libraries silently lost their aliases
  and Vite resolved them to `build/` output instead of source. For the bundled
  frontend libs that meant serving `tsc` output compiled with the production JSX
  runtime, whose `react/jsx-runtime` import the dev-time dependency scanner
  never sees; Vite handed the browser React's raw CJS shim and every app
  frontend crashed on load with `module is not defined`. The fix is a one-line
  `|| packageJson.exports`, but finding it required starting a dev server, which
  nothing in CI does. Expect a similar check anywhere else that infers "library"
  from `main`.

### Entry points and CLIs

Anything NodeJS runs directly needs its own pass; a package can be entirely
converted and still have every one of its commands broken, because no CI job
runs them.

- **Extensionless scripts take the package's `type`.** A `bin/foo` with a node
  shebang and a CommonJS body is parsed as ESM the moment `type: module` lands,
  and dies on its own `require`.
- **`require.main === module` doesn't exist.** Compare `process.argv[1]` (NodeJS
  resolves it to an absolute path, even for `node ./build/index.js`) against
  `fileURLToPath(import.meta.url)`.
- **`node -r esbuild-runner/register ./scripts/foo.ts` stops working.** `-r` is
  a CommonJS preload, and NodeJS routes a `.ts` entry point to the ESM loader
  once the package is `type: module`, so it fails with
  `Unknown file extension ".ts"`.
- **The esbuild-runner hook can't be salvaged.** It is a `require` hook, so it
  can neither load ESM sources nor resolve the `.js` specifiers those sources
  now use — it looks for `./foo.js` literally and never finds `foo.ts`. Scripts
  that transpiled sources on the fly should run the **compiled output** instead,
  which means their TypeScript has to live somewhere the build compiles (i.e.
  under `src/`, since `tsconfig.build.json` covers `src` and not `scripts`).
  Give those modules a narrow `coverage.exclude`: they were outside `src/`
  before, so they were never counted, and excluding them keeps the status quo
  rather than lowering the bar.
- Where a package script wraps a CLI, have it build first
  (`pnpm build:self && node ./build/...`) so the command stays a single step and
  can't silently run a stale build.

### Default imports of CommonJS dependencies

`tsc` under `node16` correctly models NodeJS: a default import of a CommonJS
module is `module.exports`. Three loaders then disagree about the same line.

| loader     | `import x from 'somecjs'` gives                       |
| ---------- | ----------------------------------------------------- |
| NodeJS ESM | `module.exports` — the real default is at `.default`  |
| vitest     | applies its own `interopDefault`, so the real default |
| Vite       | resolves the package's ESM build, so the real default |

So a fix written for one loader breaks the others, and a library loaded by both
NodeJS and a bundler — as `ui` is, since backends render reports through it —
has to accept either shape:

```ts
const mod = someDefault as unknown as Whatever & { default?: Whatever };
export const thing: Whatever = mod.default ?? mod;
```

Normalize once per package rather than at each use site. This came up for
`styled-components`, `pg`, `use-interval` and `@testing-library/user-event`.
Note that upgrading doesn't avoid it: styled-components v5, v6 and even the v7
prereleases all ship without an `exports` map, so NodeJS resolves their CommonJS
build in every case.

Two traps inside the trap. A package on `bundler` resolution gets **no** `tsc`
error, so if its output is ever loaded by NodeJS the failure is silent until
runtime. And some CommonJS packages defeat NodeJS's named-export detection
entirely (`qrcode.react`, `pg`), so `import { Thing }` type-checks and then
fails to load — while vitest and Vite surface those names happily.

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

Because that third processor is the one nothing else stands in for, check it
exhaustively rather than at the entry point:

- **Import every module under `build/`** with plain `node`, not just
  `build/index.js`. A bad interop line sits in whichever module happens to
  contain it, and importing only the entry misses anything the entry doesn't
  reach. Sweeping all of `ui`'s 255 modules is what surfaced its `qrcode.react`
  and `require.resolve` failures; both were invisible to `tsc` and to vitest.
- **Run every entry point and CLI.** VxDesign's server and worker could not
  start at all — three separate causes — while its tests, lint, type-check and
  full CI were green, because only vitest ever loaded them.
- **Run the builds and servers CI doesn't.** `prod-build` and the frontend dev
  servers are the two consumers of a package's `package.json` shape that no CI
  job exercises, and each has already shipped a break: prod-build failing at the
  first converted dependency, and every app frontend crashing on load after the
  libraries lost their Vite source aliases. Building one app for production and
  loading one app frontend in a browser catches both in a few minutes.

Two vitest-specific effects are worth expecting rather than debugging:

- **Converting a library brings it into `vi.mock`'s reach.** While it is
  CommonJS it is externalized and a dependent's mock never applies inside it; as
  ESM the mock does apply. That shows up as snapshot churn in _dependent_
  packages, so it reads like a rendering regression. Confirm it is benign by
  diffing the regenerated snapshots and showing the change is confined to what
  the mock controls.
- **Setup files must not import an ESM workspace package at module scope.**
  `setupFiles` run before the test file, so before any `vi.mock`; an eager
  import instantiates part of the graph too early and those modules keep their
  real bindings, silently disabling mocks across the suite. Load it inside the
  hook with `vi.importActual` instead, which also resolves the package's own
  dependencies unmocked. `vx/no-esm-workspace-import-in-test-setup` enforces
  this, and reports only packages that are already ESM so each one is flagged as
  it converts. Note that no vitest alias or `deps` configuration fixes this —
  aliases address module identity, and this is a matter of timing.

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

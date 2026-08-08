# Disallows importing ESM workspace packages at module scope in vitest setup files (`vx/no-esm-workspace-import-in-test-setup`)

vitest setup files (`setupFiles`) run **before** the test file, and therefore
before any `vi.mock()` call is registered. Anything a setup file imports at
module scope is instantiated at that point.

While a workspace package is CommonJS this is harmless: vitest externalizes it,
so it is loaded by node's `require` outside vitest's module runner and never
enters the module graph vitest mocks. Once the package is ESM, the runner
processes it — so importing it pulls a slice of the dependency graph into the
runner too early, and every module in that slice keeps its **real** bindings for
the rest of the run.

The failure is silent and remote: a mock in some unrelated test file simply
stops taking effect, in a module nobody edited. In one instance a single
`import { cleanupCachedBrowser } from '@votingworks/printing'` in nine setup
files caused `vi.mock('@votingworks/utils')` not to reach
`@votingworks/backend`, which disabled a feature flag that skips
election-package authentication, which failed seven app-backend suites with a
missing-env-var error.

This rule only reports packages that are **currently** ESM, so it starts
flagging each workspace package as that package converts.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
// in test/setupTests.ts, where @votingworks/printing is ESM
import { cleanupCachedBrowser } from '@votingworks/printing';

afterAll(async () => {
  await cleanupCachedBrowser();
});
```

Examples of **correct** code for this rule:

```ts
// in test/setupTests.ts
afterAll(async () => {
  const { cleanupCachedBrowser } = await vi.importActual<
    typeof import('@votingworks/printing')
  >('@votingworks/printing');
  await cleanupCachedBrowser();
});
```

Prefer `vi.importActual` over a plain dynamic `import`: it additionally resolves
the package's own dependencies unmocked, so a test that stubs something like
`node:fs` does not break a library that reads files when it is imported. When
nothing is mocked it returns the same module instance the tests use, so cleaning
up a shared resource still affects the resource they created.

Type-only imports are not reported, since they are erased and load nothing:

```ts
import type { Printer } from '@votingworks/printing';
```

## When Not To Use It

If a setup file must run something at module scope that can only come from an
ESM workspace package — registering a custom matcher with `expect.extend`, say —
consider moving it into a `beforeAll` hook. If that is genuinely not possible,
disable the rule for that line and note why.

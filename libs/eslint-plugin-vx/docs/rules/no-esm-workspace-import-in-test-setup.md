# Disallows module-scope imports of workspace packages in vitest setup files (`vx/no-esm-workspace-import-in-test-setup`)

vitest setup files (`setupFiles`) run **before** the test file, and therefore
before any `vi.mock()` call is registered. For CJS modules vitest lets node
handle loading it. vitest's `require` hook then intercepts the ones that were
mocked, and everything works as expected. For ESM modules vitest loads them
eagerly and therefore aren't mocked.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
// in test/setupTests.ts
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
ESM workspace package, e.g. a custom matcher with `expect.extend`, consider
moving it into a `beforeAll` hook or just disable the rule for that line.

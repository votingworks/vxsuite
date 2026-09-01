# Fixtures

Each file in `src/` is a small TypeScript source file modeling cases found in
the repo.

Each fixture opens with a `Driver:` comment — the exact calls `fixture_tests.ts`
makes, which determine what is covered. Inline comments beside the code describe
the behavior each construct is testing.

## How they run

`test/global_setup.ts` runs `fixture_tests.ts` with vitest to produce a coverage
report: `coverage/coverage-final.json`. `../src/reporter.test.ts` then analyzes
every fixture against that report and snapshots the resulting coverage report.

## Adding a case

1. Add a function (or file) under `src/`, with directives as the case requires,
   and update the fixture's header.
2. Call it from `fixture_tests.ts` so exactly the documented paths execute.
3. Run `pnpm test:run -u` and review the snapshot diff.

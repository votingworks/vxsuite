# ☂️ coverage-check

A custom coverage reporter that enforces our approach to code coverage:

> Every uncovered statement, function, and branch must be explicitly marked as
> either deferred or excluded from code coverage.

The checker is an istanbul coverage reporter. It receives the coverage map
produced by vitest and checks it against inline source code comments known as
"directives," which mark code as deferred or excluded from coverage.

This approach has some advantages over traditional threshold-based reporting:

- When code changes, you can easily see a _diff_ of which specific pieces of
  code changed in their coverage
- Coverage exceptions are colocated with the code, so if the code moves, the
  exception moves with it

The checker also uses the TypeScript compiler to find unreachable code (e.g. the
`default` arm of an exhaustive `switch`) and automatically excludes it from
coverage requirements.

Note: This package is a devDependency of every tested package, so it cannot
depend on any other package.

## Usage

The checker runs automatically whenever vitest collects coverage. The shared
`vitest.config.shared.mts` registers `vitest_coverage_reporter.cjs` as an
istanbul coverage reporter. Coverage is on in CI (`CI=true`) and off locally by
default. To run it locally from a package directory:

```sh
pnpm test:run --coverage
```

## Directives

- `@coverage-exclude`: Marks code that is intentionally not covered by tests
  (e.g. code that's impossible to cover)
- `@coverage-defer`: Marks code that is temporarily not covered by tests but
  should gain coverage in the future (e.g. prototype code)

Each directive may be followed by an optional reason.

```ts
// Binds to the next item in the code
// @coverage-exclude: <reason>
// @coverage-defer: <reason>

// Place at the top of the file to exclude/defer the entire file
// @coverage-exclude-file: <reason>
// @coverage-defer-file: <reason>

// Place above an if-statement to exclude/defer an implicit else arm
// @coverage-exclude-else: <reason>
// @coverage-defer-else: <reason>
```

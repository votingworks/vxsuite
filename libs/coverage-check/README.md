# coverage-check

Enforces the repo's per-entity coverage invariant:

> Every uncovered statement, function, and branch must carry an inline directive
> comment — `@coverage-exclude` (deliberately untested, permanent) or
> `@coverage-defer` (debt that should gain tests) — or be auto-excluded by
> policy. Anything else fails.

The checker runs after a full coverage run and reads the istanbul
`coverage-final.json` that vitest produces. Everything is instrumented
(directives are our own comment syntax that istanbul never sees), so hits on
directive-marked code are visible and staleness is detected on every run.

## Usage

```sh
vitest run --coverage && coverage-check check <pkg-dir>
```

The `&&` matters: it is the primary partial-run guard. Never run the checker
after a watch-mode, `--changed`, filtered, or failing run — those reports show
every unexercised file as uncovered. The checker also refuses reports whose hit
distribution indicates a partial run.

Options:

- `--never-scan <dir>` (repeatable) — extra directories to scan for never-param
  function declarations (e.g. `libs/basics` for `throwIllegalValue`).
- `--timing` — print elapsed time.

Output is automatic: graphical diagnostics (snippet boxes with underlined
findings and `help:` lines) on a TTY, one line per finding when piped or
captured.

Exit codes: `0` pass (warnings allowed), `1` findings that fail the invariant,
`2` operational error (missing/malformed report, partial-run refusal).

## Directives

```ts
// @coverage-exclude: <reason>   deliberately untested, permanent
// @coverage-defer: <reason>     untested debt, should gain tests
// @coverage-exclude-file: <reason>   whole file (top of file only)
// @coverage-defer-file: <reason>
// @coverage-exclude-else: <reason>   the implicit-else arm of the next if
// @coverage-defer-else: <reason>
```

A directive binds to the outermost syntactic node starting at the next token
position — a statement, a declaration including its body, or an expression
(`?? /* @coverage-exclude */ fallback()`). The reason is optional but
encouraged. Both `//` and `/* */` comments work; a directive that must share a
line with code needs `/* */`.

Call sites of functions declared with a required parameter typed `never` (e.g.
`throwIllegalValue`) are auto-excluded — the signature is a static
unreachability proof, so no directive is needed.

## Diagnostics

### uncovered-statement

A statement is never executed by tests and carries no directive. Add a test that
exercises it, or mark it: `// @coverage-defer: <reason>` (should gain tests) or
`// @coverage-exclude: <reason>` (deliberately untested).

### uncovered-function

A function is never called by tests and carries no directive. Same resolutions
as `uncovered-statement`.

### uncovered-branch

A branch arm (if/else arm, ternary or logical arm, switch case, default
parameter) is never taken by tests and carries no directive. Same resolutions as
`uncovered-statement`. When an `if` has no `else` and its then-arm terminates
(return/throw/break/continue), the implicit-else arm is attributed to the first
statement after the `if` — a directive there covers both. When the then-arm does
not terminate, use `@coverage-…-else` above the `if`.

### orphaned-directive

A directive has no code to bind to before the end of its enclosing scope. Delete
it, or move it directly above the code it should mark.

### misplaced-else-directive

An `-else` directive targets an `if` that has an explicit `else`. The `-else`
form marks only _implicit_ else arms; mark the explicit arm itself with a plain
directive.

### misplaced-file-directive

A `-file` directive appears after the first statement of the file. Move it to
the top of the file, or use a plain directive for a single node.

### useless-file-directive

A directive sits in a file that has no coverage entities at all (the file is
absent from the report — e.g. a barrel `index.ts` or a type-only module). There
is nothing to exempt: delete the directive, or for whole files that should never
be instrumented, use `coverage.exclude` in the vitest config.

### stale-directive (warning)

Everything a directive marks is now covered, so it exempts nothing. Delete it.
Warnings never fail the run — a test added elsewhere can indirectly cover marked
code — but stale directives are dormant dark zones (if the code later loses
coverage they silently absorb the regression), so clean them up periodically.

### exhaustiveness-defeated (warning)

A never-param call site (e.g. `throwIllegalValue`) was executed at runtime.
TypeScript's narrowing was defeated — a bug, or a test deliberately subverting
types. Investigate.

## Golden corpus

`corpus/` holds the attachment-semantics golden tests: TypeScript fixtures
covering the repo's real patterns (styled-components interpolations, JSX
containers, ternary arms, switch cases, fluent chains, CDF `z.lazy` emission), a
real istanbul coverage report generated from them, and expected verdicts per
fixture. The cargo integration test (`tests/corpus.rs`) fails on any divergence.

To regenerate the coverage report after changing fixtures:

```sh
cd corpus && pnpm install --ignore-workspace && pnpm coverage
```

To audit or regenerate `expected/` files, inspect the output of:

```sh
coverage-check dump corpus/
```

Fixtures are matched to report entries by file name (names are unique in the
corpus), so the committed report's absolute paths don't need to match the
checkout location.

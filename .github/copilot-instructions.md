# Copilot Code Review Instructions

VxSuite is a paper-ballot voting system. Repo-wide conventions are in
[CLAUDE.md](../CLAUDE.md). The guidance below is specific to reviewing pull
requests.

## Software Updates and Data Migrations

Every app except VxHub (`apps/hub/`) runs on air-gapped machines. Those machines
are updated by reimaging them with a fresh build, so data from the previous
version never carries over. For these apps:

- Don't ask for migrations, backfills or backward-compatible reads when a SQLite
  schema (`schema.sql`), store or workspace data format changes.
- Don't flag removed or renamed tables, columns or settings as breaking existing
  installs.

This covers data stored on a machine, not files that move between machines or
come from VxHub, such as election packages, CVR exports and backups.

VxHub is the exception: it's hosted, with a long-lived PostgreSQL database, so
schema changes there need a migration in `apps/hub/backend/migrations/`.

## What to Focus On

- Prioritize correctness, security and anything that affects how ballots are
  interpreted, counted or reported.
- Flag code that reimplements an existing helper, and name the helper. Look in
  `@votingworks/basics` (e.g. `assert`, `iter`, `groupBy`, `unique`,
  `deepEqual`), the other shared `libs/` packages and the package's own modules.
- Skip formatting and lint-level style. oxfmt and ESLint (`eslint-plugin-vx`)
  enforce them in CI.
- Don't suggest adding code comments or doc comments unless a lint rule requires
  them.
- Unexpected errors should throw. Don't suggest catching them just to log or
  recover. Expected errors use `Result` from `@votingworks/basics` and are
  logged.
- Voter-facing text in VxMark, VxScan and VxMarkScan must come from `appStrings`
  in `@votingworks/ui`. Flag hardcoded strings.
- Coverage must be 100% and CI enforces it. Don't suggest `istanbul ignore`;
  deliberate gaps use `@coverage-exclude` or `@coverage-defer` directives.

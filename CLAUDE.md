# CLAUDE.md - VxSuite Monorepo

## Overview

VxSuite is a paper-ballot voting system built as a TypeScript/React monorepo. It
contains 8 applications and 30+ shared libraries managed with pnpm workspaces.

## Repo Structure

```
apps/           # 8 voting system applications
  admin/        # Election administration
  central-scan/ # Central ballot scanning
  design/       # Election design (VxDesign) — see note below
  mark/         # Ballot marking device
  mark-scan/    # Combined mark + scan device
  pollbook/     # Electronic pollbook
  print/        # Ballot printing
  scan/         # Precinct ballot scanning
libs/           # 30+ shared libraries
  basics/       # Core utility functions and types
  types/        # Shared domain type definitions
  utils/        # General utilities
  ui/           # Shared React UI components (styled-components)
  auth/         # Machine authentication
  backend/      # Node.js data manipulation utilities
  db/           # Database utilities (better-sqlite3)
  grout/        # Type-safe RPC library
  test-utils/   # Shared test utilities
  fixtures/     # Shared test fixtures
  hmpb/         # Hand-marked paper ballot processing
  ballot-interpreter/ # Ballot image interpreter (includes Rust)
  logging/      # Logging utilities
  printing/     # Printer management
  ...
```

Each app typically has `frontend/`, `backend/`, and optionally
`integration-testing/` or `playwright/` subdirectories.

## Tech Stack

- **Language:** TypeScript 7.0 (strict mode)
- **Frontend:** React 18, styled-components, react-router-dom v5,
  @tanstack/react-query v4
- **Backend:** Express 4, better-sqlite3, zod for validation
- **API Layer:** @votingworks/grout (custom type-safe RPC)
- **Package Manager:** pnpm 10.34.5 (workspaces)
- **Build:** tsc (TypeScript 7 native compiler), esbuild, Vite (frontends)
- **Node:** 24.19.0
- **Rust:** Used in performance-critical libs (ballot-interpreter, pdi-scanner,
  logging)

**VxDesign exception:** VxDesign (`apps/design/`) is the only publicly-hosted
application in the monorepo. Unlike the other apps which run on air-gapped
hardware with better-sqlite3, VxDesign uses PostgreSQL and has different
infrastructure patterns (e.g. database migrations, cloud deployment).

## Commands

### Installing Dependencies

```sh
pnpm install
```

### Building

> **Turborepo is opt-in.** By default, `pnpm build`/`lint`/`test:run`/`clean`
> and `pnpm start` run the pre-Turbo pnpm behavior (recursive `--filter` builds,
> `run-dev` dev servers) — exactly as on `main`. Set the environment variable
> **`VX_USE_TURBO=1`** to route the same commands through
> [Turborepo](https://turborepo.com) instead (dependency-ordered, cached builds;
> `turbo watch` dev servers). See the `## Turborepo` section for how the switch
> works. The examples below work identically in both modes unless noted.

```sh
# Build everything (from repo root — always uses Turbo; see below)
pnpm build

# Build a specific package and its dependencies
pnpm --filter @votingworks/<package-name> build
# ...opt into Turbo for the same build:
VX_USE_TURBO=1 pnpm --filter @votingworks/<package-name> build

# Build the package only, without (re)building its dependencies
pnpm --filter @votingworks/<package-name> build:self
```

A package's public `build`/`lint`/`test:run`/`test:ci`/`clean` scripts delegate
to the `script/vx-task` orchestrator (via
`pnpm -w vx-task <task> $npm_package_name`), which picks pnpm or Turbo based on
`VX_USE_TURBO`. The actual per-package work always lives in the `:self` scripts
(e.g. `build:self`). The repo-root
`pnpm build`/`test`/`lint`/`type-check`/`clean` scripts did not exist on `main`,
so they are Turbo-only regardless of `VX_USE_TURBO`.

### Running Tests

**Always use `pnpm test:run` to prevent the terminal from hanging in watch
mode:**

```sh
# Run all tests in a package (from that package's directory)
pnpm test:run

# Run a specific test file
pnpm test:run <file_path>

# Run tests matching a pattern
pnpm test:run -t "test name pattern"
```

Do NOT use `pnpm test` or run vitest directly without `--run` — the watch mode
will hang.

Each package's `test` script watches locally (vitest, preceded by a Turbo build
of its dependencies); `test:run` runs once and is what CI runs. Both build the
package's dependencies first via Turbo — see the `:self` split in the
`## Turborepo` section for how. Coverage is enabled only in CI, keyed on the
`CI` env var in `vitest.config.shared.mts` (`coverage.enabled: isCI`), so
`test:run` is fast locally and enforces the 100% thresholds in CI. VxDesign
keeps a dedicated `test:ci` for its Postgres/migration CI steps.

### Linting & Formatting

```sh
# Lint everything (from repo root, cached by Turbo)
pnpm lint

# Check for lint errors (from the package directory)
pnpm lint

# Auto-fix lint errors (from the package directory)
pnpm lint:fix

# Or from the repo root using --filter
pnpm --filter @votingworks/<package-name> lint
pnpm --filter @votingworks/<package-name> lint:fix
```

### Type Checking

Use `tsc` for type checking. As of TypeScript 7, `tsc` is the native (Go-based)
compiler, installed via the `@typescript/native` alias (`npm:typescript@7.0.2`):

```sh
# Type-check everything (from repo root)
pnpm type-check

# Type-check a specific package
pnpm --filter @votingworks/<package-name> run type-check

# Build (includes type checking) a package and its dependencies
pnpm --filter @votingworks/<package-name> build
```

TypeScript 7 does not ship the classic JavaScript compiler API. The `typescript`
package is therefore aliased to `@typescript/typescript6`, which provides that
API (as `import * as ts from 'typescript'`) for tooling such as
`typescript-eslint` and the custom `eslint-plugin-vx` rules. Its binary is
`tsc6`; do not use it for building — all compilation and type checking
(including in CI) goes through the TypeScript 7 `tsc` from `@typescript/native`.
Aliasing to a distinctly-named package (rather than a second `typescript`) keeps
`import 'typescript'` unambiguous.

### Development Servers

```sh
# Run an app's dev servers (frontend + backend) from repo root
pnpm --filter @votingworks/<app-frontend> start
# ...or from the app's frontend directory
pnpm start
```

Each app frontend's `start` script delegates to `script/vx-dev`. By default (no
`VX_USE_TURBO`) it runs the pre-Turbo `run-dev`, which uses `concurrently` to
run Vite, a `tsc --watch` build, and a nodemon-reloaded backend. With
`VX_USE_TURBO=1` it runs `turbo watch` over the frontend's Vite dev server
(`dev:server`) and its backend service (`dev`); because `turbo watch` re-runs a
task when the package **or any of its dependencies** change, editing a shared
library rebuilds it and restarts the backend automatically, including transitive
dependency changes. In both modes Vite keeps running across library changes and
handles its own HMR.

**Stopping dev servers.** Pressing **Ctrl-C** in the terminal running
`pnpm start` stops everything cleanly in both modes. But `kill`ing the
`pnpm start` process (it doesn't forward the signal), a `SIGKILL`/editor "stop"
button, or a `pkill` that hits a wrapper instead of the runner can leave the
servers running detached, holding ports 3000/3001/3002. To force-stop everything
and free those ports, run `pnpm kill-dev` (`script/kill-dev`) — it signals
`turbo watch` and sweeps up any orphaned Vite/backend processes (covering both
the `run-dev` and `turbo watch` modes).

## Turborepo

Task orchestration and caching are handled by [Turborepo](https://turborepo.com)
(`turbo.json` at the repo root), **when opted in via `VX_USE_TURBO`**.

**Opt-in switch.** Turbo is off by default so this branch can land on `main`
without forcing the whole team onto it at once. Each package's public
`build`/`lint`/`test:run`/`test:ci`/`clean` script delegates to
`script/vx-task`, and each frontend's `start` delegates to `script/vx-dev`.
These orchestrators read `VX_USE_TURBO`:

- **unset (default):** reproduce the pre-Turbo behavior from `main` — pnpm's
  recursive `--filter` for dependency-ordered builds, the package's own `:self`
  script for lint/test, and `run-dev` for dev servers.
- **set (e.g. `VX_USE_TURBO=1`):** run the matching Turbo task / `turbo watch`.

The real per-package work always lives in the `:self` scripts; only the
orchestration around them differs between the two modes. CI runs the pre-Turbo
path (no `VX_USE_TURBO` in the CircleCI env) except for one temporary
`build-with-turbo` job that builds everything with `VX_USE_TURBO=1` so the Turbo
path can't silently rot; remove that job once Turbo becomes the default.

Tasks and their wiring (`turbo.json`, used when `VX_USE_TURBO` is set):

| Task            | Depends on    | Cached outputs                                     |
| --------------- | ------------- | -------------------------------------------------- |
| `build:self`    | `^build:self` | `build/**`, `*.node`                               |
| `type-check`    | `^build:self` | `tsconfig.tsbuildinfo`                             |
| `lint:self`     | `^build:self` | (logs only)                                        |
| `test:run:self` | `build:self`  | (logs only)                                        |
| `test:ci:self`  | `build:self`  | (logs only; design's Postgres/migration CI steps)  |
| `clean:self`    | —             | not cached                                         |
| `dev:server`    | `^build:self` | not cached (persistent; frontend Vite dev server)  |
| `dev`           | `build:self`  | not cached (persistent + interruptible; a backend) |

Run any task directly with `turbo run <task> [--filter=<pkg>]`. Root scripts
(`pnpm build`, `pnpm lint`, `pnpm test`, `pnpm type-check`, `pnpm clean`) wrap
the corresponding Turbo task across all packages (Turbo-only; they had no
pre-Turbo equivalent on `main`).

**The `:self` split and `vx-task` delegation:** each package's public
`build`/`clean`/`lint`/`test:run`/`test:ci` script is a thin delegation of the
form `pnpm -w vx-task <task> $npm_package_name`; the `:self` task does the
actual work (tsc/eslint/vitest). In Turbo mode `vx-task` runs
`turbo run <task>:self --filter=$npm_package_name --` (building
`build:self`/`^build:self` first, so the task never runs against unbuilt deps);
in the default mode it runs the pnpm equivalent. Extra args pass straight
through, so `pnpm test:run <file>` and `pnpm test:run -t "pattern"` still work
in both modes. `validate-monorepo` enforces that any package defining a `:self`
task delegates its public task to `vx-task`. The dev-time watcher `pnpm test` is
not a delegated task (it's persistent and interactive); it prefixes
`pnpm -w vx-task build $npm_package_name` (which builds deps via pnpm or Turbo
per the switch) and then execs `vitest` directly, so deps are built once up
front while the watcher keeps its native UI.

Each package's `build:self` writes its incremental `tsc` build-info to
`build/tsconfig.build.tsbuildinfo` (inside `build/`, enforced by
`validate-monorepo`), so it's captured by the `build/**` output and removed
atomically by `rm -rf build`. Keeping it there avoids a stale build-info making
`tsc` skip re-emitting after `build/` is deleted.

**Cross-worktree cache:** Turbo automatically shares its local cache across git
worktrees of this repo (stored under the shared `.git` directory), so artifacts
built in one worktree are reused in another with no configuration. The cache is
per-machine (not shared between developers) and unbounded — see
[docs/turborepo.md](docs/turborepo.md) for how to clear it, force a rebuild, and
other troubleshooting.

**CI caching:** CI currently runs Turbo tasks per package without a shared
remote cache (each job builds fresh). Enabling Turbo remote caching in CI is a
planned follow-up.

**Tooling scripts:** repo tooling that depends on built workspace packages
(`configure-env`, `generate-circleci-config`) is a shell `bin/` in the package
that owns it (e.g. `libs/monorepo-utils/bin/generate-circleci-config`,
`libs/utils/bin/configure-env`), which builds that package with turbo first
(cached, so ~instant when warm), then runs its built CLI in `build/bin/`. The
CLI logic lives in `src/bin/` so it's type-checked, linted, and built like the
rest of the package (excluded from coverage). Root `package.json` points the
`pnpm -w <name>` scripts straight at those bins. This is why the tools work from
a fresh checkout without a prior full build.

## Testing

- **Framework:** Vitest
- **Coverage:** 100% line and branch coverage required (Istanbul provider)
- **React Testing:** @testing-library/react
- **Property-based:** fast-check
- **E2E:** Playwright (in apps with `playwright/` directories)
- **Test location:** Co-located with source files as `*.test.ts` / `*.test.tsx`

### Key Test Libraries

| Library                                 | Location                                 | Purpose                                                                         |
| --------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------- |
| `mockFunction`                          | `@votingworks/test-utils`                | Strict mock with ordered call expectations and `.assertComplete()`              |
| `createMockClient<Api>()`               | `@votingworks/grout-test-utils`          | Grout API client mocking (each method is a `mockFunction`)                      |
| `MockUsbDrive` / `createMockUsbDrive()` | `@votingworks/usb-drive`                 | Mock USB drive with `insertUsbDrive()`/`removeUsbDrive()`                       |
| `mockBaseLogger()` / `mockLogger()`     | `@votingworks/logging` (in `test_utils`) | Mock loggers with vitest mock functions                                         |
| Election fixtures                       | `@votingworks/fixtures`                  | Election definitions, CVR data, ballot images (`electionGeneralFixtures`, etc.) |
| `@votingworks/test-utils`               | `libs/test-utils`                        | Shared helpers: `mockFunction`, auth mocking, timer utilities, election helpers |

### Frontend Test Patterns

Each app has a custom render helper at
`apps/<app>/frontend/test/react_testing_library.tsx`:

```typescript
export const render = makeRender(onTestFinished);
```

Typical frontend test structure:

```typescript
import { expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '../test/react_testing_library';

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('renders component', async () => {
  apiMock.expectGetSomeData().resolves(someData);
  render(<MyComponent apiClient={apiMock.mockApiClient} />);
  await screen.findByText('expected text');
});
```

Each app defines its own `createApiMock()` helper (in
`test/helpers/mock_api_client.tsx`) wrapping `createMockClient<Api>()`.

### Backend Test Patterns

Backend tests typically create a full app instance with mocked dependencies:

```typescript
const mockAuth = buildMockInsertedSmartCardAuth(vi.fn);
const mockUsbDrive = createMockUsbDrive();
const logger = mockBaseLogger({ fn: vi.fn });
const app = buildApp({
  auth: mockAuth,
  logger,
  usbDrive: mockUsbDrive.usbDrive,
});
const apiClient = grout.createClient<Api>({
  baseUrl: `http://localhost:${port}/api`,
});
```

### mockFunction Usage

`mockFunction` from `@votingworks/test-utils` enforces strict call ordering:

```typescript
const fn = mockFunction('myFn');
fn.expectCallWith(arg1, arg2).returns(result); // single expected call
fn.expectRepeatedCallsWith(arg).resolves(result); // repeated calls
fn.assertComplete(); // verify all expected calls were made (usually in afterEach)
```

## Code Style

- **Prettier:** single quotes, trailing commas (es5), semicolons, prose wrap
  always
- **ESLint:** Airbnb base + @typescript-eslint + custom `eslint-plugin-vx`
  (based on Google TypeScript Style Guide)
- **Stylelint:** standard config with styled-components support
- **Pre-commit hooks:** Husky + lint-staged (auto-formats and lints staged
  files)

### Key Style Rules

- **Named exports only** — no default exports (except Storybook stories)
- **Function declarations** — use `function foo() {}` for named functions, not
  arrow function expressions
- **`const` by default** — only use `let` when reassignment is needed
- **Interfaces over type aliases** — prefer `interface` for object shapes
- **Array syntax** — use `T[]` not `Array<T>`
- **File naming** — snake_case for all module files (e.g. `app_root.tsx`,
  `use_language_controls.ts`)
- **Constants** — UPPER_CASE for module-level constants
- **No floating promises** — all promises must be awaited or explicitly voided
  (`void somePromise()`)
- **Exhaustive switches** — use `switch`/`case` with `throwIllegalValue` from
  `@votingworks/basics` for discriminated unions instead of `if`/`else` chains
- **Error handling** — fail fast for unexpected errors: unexpected errors should
  crash the application (throw an exception) to ensure early detection and
  prevent undefined behavior. Expected errors resulting from user behavior or
  known external conditions should be handled with `Result<T, E>` from
  `@votingworks/basics` to present actionable error messages to the user.
  Expected errors should always be logged.
- **Logging** — all user actions, and errors should be logged. Use
  `@votingworks/logging` for structured log events.
- **Domain types over primitives** — use domain types like `ContestId`,
  `PrecinctId`, etc. instead of plain `string`
- **Prefer existing utilities** — use utility functions from
  `@votingworks/basics` (e.g. `range`, `iter`, `groupBy`) rather than verbose JS
  idioms (e.g. `Array.from`)
- **Readonly** — mark properties as `readonly` when they aren't reassigned
- **React** — functional components only, with hooks; components return
  `JSX.Element`
- **Styled-components** — for all CSS-in-JS styling
- **No shell-interpreted child processes** — never use `exec`, `execSync`,
  `spawn`, or `spawnSync` from `node:child_process`. Always use `execFile`,
  `execFileSync`, `fork`, or the `exec` helper in `libs/usb-drive/src/exec.ts`
  (which wraps `execFile`). Shell-interpreted variants pass arguments through a
  shell, which invites command injection.
- **Do not add comments** where the code is self-evident or self-documenting.
  Only add comments where the logic is non-obvious or requires context that
  isn't clear from the code itself.

## Package Naming Conventions

All packages are scoped under `@votingworks/`. The naming pattern maps directly
to the directory structure:

| Shorthand                            | Package Name                        | Directory                    |
| ------------------------------------ | ----------------------------------- | ---------------------------- |
| VxAdmin / admin-frontend             | `@votingworks/admin-frontend`       | `apps/admin/frontend/`       |
| VxAdmin backend / admin-backend      | `@votingworks/admin-backend`        | `apps/admin/backend/`        |
| VxMark / mark-frontend               | `@votingworks/mark-frontend`        | `apps/mark/frontend/`        |
| VxCentralScan / central-scan-backend | `@votingworks/central-scan-backend` | `apps/central-scan/backend/` |
| VxDesign / design-frontend           | `@votingworks/design-frontend`      | `apps/design/frontend/`      |

**General pattern:**

- Directory: `apps/<app-name>/<frontend|backend>/`
- Package: `@votingworks/<app-name>-<frontend|backend>`
- "Vx" prefix names (VxMark, VxScan, VxAdmin, etc.) refer to the app and can
  mean either frontend or backend depending on context
- Libs: `libs/<lib-name>/` → `@votingworks/<lib-name>`

## Frontend-Backend API Pattern (Grout)

Every app uses `@votingworks/grout` for type-safe RPC between frontend and
backend. The pattern is consistent across all apps:

### Backend: Define the API (`apps/<app>/backend/src/app.ts`)

```typescript
function buildApi(context: {
  auth: Auth;
  workspace: Workspace;
  logger: Logger;
}) {
  return grout.createApi({
    getAuthStatus() {
      return context.auth.getAuthStatus();
    },
    async saveSetting(input: { key: string; value: string }) {
      context.workspace.store.setSetting(input.key, input.value);
    },
    // Spread shared API builders
    ...createSystemCallApi({ logger, usbDrive }),
    ...createUiStringsApi({ logger, store }),
  });
}

// Export the type for the frontend (type-only)
export type Api = ReturnType<typeof buildApi>;

// Mount on Express
app.use('/api', grout.buildRouter(api, express));
```

### Frontend: Consume the API (`apps/<app>/frontend/src/api.ts`)

```typescript
import type { Api } from '@votingworks/mark-backend';

export type ApiClient = grout.Client<Api>;

export function createApiClient(): ApiClient {
  return grout.createClient<Api>({ baseUrl: '/api' });
}

// Wrap each method with react-query
export const getAuthStatus = {
  queryKey(): QueryKey {
    return ['getAuthStatus'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getAuthStatus());
  },
} as const;

export const saveSetting = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.saveSetting, {
      async onSuccess() {
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;
```

### Key Points

- API methods take a single object argument (named parameters) and can be sync
  or async
- The `Api` type is exported from the backend and imported as `type` in the
  frontend — this provides end-to-end type safety
- Frontend wraps each API method as a react-query `useQuery` (reads) or
  `useMutation` (writes)
- Shared API builders (`createSystemCallApi`, `createUiStringsApi`) are spread
  into every app's API
- Each app provides its API client via React context (`ApiClientContext` /
  `ApiProvider`)

## CI (CircleCI)

CI runs on CircleCI (`.circleci/config.yml`), not GitHub Actions — the two
`.github/workflows/` files are unrelated. Every branch push builds; a PR is not
required. One push creates two pipelines: a setup pipeline that path-filters,
then a continuation pipeline whose workflows hold the ~60 real jobs.

### Status

With a PR: `gh pr checks <pr>` (add `--watch` to follow it).

Without a PR, always pass `per_page=100`:

```sh
gh api "repos/votingworks/vxsuite/commits/<sha>/status?per_page=100" \
  --jq '.state, (.statuses[] | select(.state != "success") | .context)'
```

The default page size is 30 and this repo posts ~62 statuses, so omitting
`per_page` silently truncates — a truncated page can read green while a failure
sits on page 2. CircleCI reports _statuses_, not check runs; `.../check-runs`
returns nothing here.

### Logs

The project is public, so the CircleCI API needs no token:

```sh
curl -s "https://circleci.com/api/v2/project/gh/votingworks/vxsuite/pipeline?branch=<urlencoded>" \
  | jq -r '.items[] | "\(.number) \(.id) \(.vcs.revision[0:10])"'
curl -s "https://circleci.com/api/v2/pipeline/<pipeline-id>/workflow" \
  | jq -r '.items[] | "\(.name) \(.id) \(.status)"'
curl -s "https://circleci.com/api/v2/workflow/<workflow-id>/job" \
  | jq -r '.items[] | select(.status != "success") | "\(.name) job=\(.job_number)"'
curl -s "https://circleci.com/api/v1.1/project/github/votingworks/vxsuite/<job-number>" > /tmp/job.json
jq -r '.steps[].actions[] | select(.status != "success") | .output_url' /tmp/job.json
curl -s "<output-url>" | jq -r '.[].message' | sed 's/\x1b\[[0-9;]*m//g'
```

Three things that yield empty or misleading output:

- A pipeline can hold more than one workflow (e.g. `test` plus a separately
  sharded job), so iterate all workflows rather than taking `.items[0]`.
- Select failing steps with `.status != "success"`, not `.failed == true` or a
  non-zero `.exit_code`. A step killed by the 10-minute no-output timeout has
  `status: "timedout"` with both of those null, so an exit-code filter finds
  nothing and the job looks like it has no failing step.
- `output_url` is a short-lived presigned S3 URL — fetch it immediately after
  reading the job JSON, never from a saved earlier response.

## Pull Requests

When creating PRs, use the repo template at `.github/pull_request_template.md`.

## Key Conventions

- All shared types live in `@votingworks/types`
- Use `@votingworks/grout` for frontend-backend API communication
- Database access uses `@votingworks/db` (wraps better-sqlite3)
- Use `@votingworks/basics` for utility functions (Result types, assert, etc.)
- UI components should use `@votingworks/ui` shared library with
  styled-components
- **Voter-facing strings** — All voter-facing text in VxMark, VxScan, and
  VxMarkScan must use `appStrings` from `@votingworks/ui` (defined in
  `libs/ui/src/ui_strings/app_strings.tsx`) to support internationalization.
  Never hardcode voter-facing strings directly in components.

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

- **Language:** TypeScript 5.8 (strict mode)
- **Frontend:** React 18, styled-components, react-router-dom v5,
  @tanstack/react-query v4
- **Backend:** Express 4, better-sqlite3, zod for validation
- **API Layer:** @votingworks/grout (custom type-safe RPC)
- **Package Manager:** pnpm 8.15 (workspaces)
- **Build:** tsgo, esbuild, Vite (frontends)
- **Node:** 20.16.0
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

```sh
# Build a specific package and its dependencies
pnpm --filter @votingworks/<package-name>... build

# Build just one package (assumes deps are built)
pnpm --filter @votingworks/<package-name> build:self
```

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

### Linting & Formatting

```sh
# Check for lint errors (from the package directory)
pnpm lint

# Auto-fix lint errors (from the package directory)
pnpm lint:fix

# Or from the repo root using --filter
pnpm --filter @votingworks/<package-name> lint
pnpm --filter @votingworks/<package-name> lint:fix
```

### Development Servers

```sh
# Run a dev server for an app (from repo root)
pnpm --filter @votingworks/<app-frontend> start
```

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
- **Error handling** — fail fast for unexpected errors: unexpected errors should
  crash the application (throw an exception) to ensure early detection and
  prevent undefined behavior. Expected errors resulting from user behavior or
  known external conditions should be handled with `Result<T, E>` from
  `@votingworks/basics` to present actionable error messages to the user.
  Expected errors should always be logged.
- **Logging** — all user actions, and errors should be logged. Use
  `@votingworks/logging` for structured log events.
- **Readonly** — mark properties as `readonly` when they aren't reassigned
- **React** — functional components only, with hooks; components return
  `JSX.Element`
- **Styled-components** — for all CSS-in-JS styling
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

## Key Conventions

- All shared types live in `@votingworks/types`
- Use `@votingworks/grout` for frontend-backend API communication
- Database access uses `@votingworks/db` (wraps better-sqlite3)
- Use `@votingworks/basics` for utility functions (Result types, assert, etc.)
- UI components should use `@votingworks/ui` shared library with
  styled-components

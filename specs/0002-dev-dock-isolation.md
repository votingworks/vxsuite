# Dev-dock mock file isolation

**Author:** @eventualbuddha

**Status:** planning

## Problem

The dev-dock provides a simulated hardware environment during development: a
mock USB drive, a mock smart card, a mock printer, and mock scanners. Most of
these are backed by files on disk so that the dev-dock UI can manipulate them
and running app processes can read them.

Before this change, mock files were stored in different places depending on
`NODE_ENV`, and neither placement was fully isolated across the common ways we
run the repo:

| Mock resource                        | `development` path                                                 | `test` / other path         |
| ------------------------------------ | ------------------------------------------------------------------ | --------------------------- |
| USB drive                            | `libs/usb-drive/dev-workspace/` (inside the package)               | `/tmp/mock-usb`             |
| Printer (HP)                         | `libs/printing/dev-workspace/` (inside the package)                | `/tmp/mock-printer`         |
| Printer (Fujitsu)                    | `libs/fujitsu-thermal-printer/dev-workspace/` (inside the package) | `/tmp/mock-fujitsu-printer` |
| Smart card                           | `/tmp/mock-file-card.json`                                         | `/tmp/mock-file-card.json`  |
| Dev-dock state (election, etc.)      | `~/.vx-dev-dock/` (user home dir)                                  | —                           |
| Batch scanner images (VxCentralScan) | `~/.vx-dev-dock/batch-images/` (user home dir)                     | —                           |
| PDI scanner (VxScan)                 | in-memory (no disk files)                                          | in-memory (no disk files)   |

This caused several problems:

1. **Test/dev cross-contamination within a worktree.** The smart card mock
   always wrote to `/tmp/mock-file-card.json` regardless of `NODE_ENV`. A
   running dev server and a concurrent test suite could read and corrupt each
   other's mock state. This only applies for tests for the dev-dock itself, but
   it's still an annoyance.

2. **Worktree collisions.** When using multiple git worktrees of the same repo
   (a common practice for working on parallel branches), the `/tmp/` paths and
   `~/.vx-dev-dock/` are shared across all worktrees. Running apps or tests in
   one worktree would affect the state of another. This affects the USB drive,
   printer, smart card, dev-dock state, and batch scanner images.

3. **Scattered and inconsistent locations.** The `dev-workspace/` subdirectory
   inside package source trees is surprising and pollutes the working directory
   with runtime state. The mix of `/tmp/`, `~/`, and in-source paths made the
   system hard to reason about.

4. **Integration tests running in `production` mode.** Playwright integration
   tests run the app with `NODE_ENV=production`, so the mock USB drive glob
   patterns did not include the dev mock path, causing export operations to fail
   or silently not find the mock drive.

## Proposal

Unify all dev-dock mock file storage under a single directory tree rooted in the
repo:

```
<repo-root>/.vx-dev-dock/<NODE_ENV>/
  mock-file-card.json       # smart card
  usb-drive/                # USB drive state + data
  hp-printer/               # HP laser printer state (state.json)
  fujitsu-printer/          # Fujitsu thermal printer state (state.json)
  prints/                   # combined print output from either printer (PDFs/images)
  batch-images/             # batch scanner temp images (VxCentralScan only)
  dev-dock.json             # dev-dock UI state (election selection, etc.)
  election.json             # election extracted from zip (when applicable)
```

The `NODE_ENV` subdirectory provides isolation based on environment:

- `development` — used by running dev servers
- `test` — used by unit tests (`NODE_ENV=test` is set by Vitest)
- `production` — used by integration tests (Playwright runs apps in production
  mode but sets `IS_INTEGRATION_TEST=true`)

The entire `.vx-dev-dock/` directory is gitignored.

### Implementation

A new `getDevDockMockRootDir(repoRoot: string): string` function in
`@votingworks/utils` computes the path. Callers pass their own `REPO_ROOT`
constant (derived from `__dirname`) rather than having the function walk up the
directory tree, keeping the logic simple and explicit.

```typescript
// libs/utils/src/dev_dock.ts
export function getDevDockMockRootDir(repoRoot: string): string {
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  return join(repoRoot, '.vx-dev-dock', nodeEnv);
}
```

Each mock implementation (USB drive, printer, smart card, dev-dock API) is
updated to call this function with its own computed `REPO_ROOT` constant instead
of using the old hardcoded paths.

The PDI scanner (VxScan) implementation is unchanged, keeping all sheet state in
memory, and requires no file path changes.

### Export allowlist updates

Apps maintain an allowlist of glob patterns for where exported files may be
written (a security boundary). Moving the mock USB drive from `/tmp/mock-usb` to
`<repo-root>/.vx-dev-dock/<NODE_ENV>/usb-drive/` means the new path no longer
matches the existing `/tmp/**/*` catch-all, so every environment's allowlist
needs an explicit `DEV_MOCK_USB_DRIVE_GLOB_PATTERN` entry.

For the `test` environment this is straightforward. For `production`, the mock
path must only be permitted when Playwright integration tests are running (not
on real hardware), so an `isIntegrationTest()` gate is added:

```typescript
NODE_ENV === 'production'
  ? isIntegrationTest()
    ? [REAL_USB_DRIVE_GLOB_PATTERN, DEV_MOCK_USB_DRIVE_GLOB_PATTERN]
    : [REAL_USB_DRIVE_GLOB_PATTERN]
  : ...
```

## Alternatives considered

**Include a worktree hash in `/tmp/` paths.** Each mock path could embed a hash
of the repo root (e.g., `/tmp/mock-usb-a1b2c3/<NODE_ENV>/`) so that different
worktrees and environments get distinct paths without touching the repo
directory. This addresses worktree collisions and test/dev contamination, but
keeps the scattered, inconsistent locations across packages. It also still
requires every caller to know the repo root in order to compute the hash, so it
buys little simplicity over the chosen approach.

**Namespace `~/.vx-dev-dock/` by worktree.** The home-directory location could
be extended to `~/.vx-dev-dock/<worktree-hash>/<NODE_ENV>/` to eliminate
worktree collisions. This would fix isolation while keeping dev-dock state
persistent across repo cleans. Rejected because the state is then invisible from
the repo (not cleaned up by `git clean` or `rm -rf`), harder to associate with a
specific branch, and doesn't help with the scattered in-source `dev-workspace/`
directories.

## Open questions

**Should `prints/` be cleared on startup?** `batch-images/` is wiped and
recreated each time VxCentralScan starts (and again when the dev-dock "Clear"
button is clicked), so it does not accumulate. `prints/`, however, grows without
bound across sessions and currently requires manual cleanup. It may be worth
clearing it on each dev server or integration test startup.

**Does the shared `prints/` directory cause confusion when running multiple app
dev servers simultaneously?** In development, VxAdmin (HP printer) and VxScan
(Fujitsu printer) can run at the same time and both write to
`development/prints/`. `getLastPrintPath()` returns whichever file was written
most recently, regardless of which app produced it. This is a new behavior
introduced by consolidating print output; it may be surprising but is unlikely
to matter in practice since the dev-dock UI is per-app.

# VxAdmin Election Design

**Author:** @caroline

**Status:** `planning`

## Existing Discussion

- [Slack: team decision on SQLite for VxAdmin's design store](https://votingworks.slack.com/archives/CEL6D3GAD/p1793749693075499)
- Prototype: `caro/admin-design-sqlite-scratch-a9ac04` branch (not for merging)

## Problem

Election design only exists in VxHub, which is online. Jurisdictions need to
design ballots offline, on VxAdmin. VxAdmin should reuse VxHub's design code
where that's easy, and VxHub must keep working while that code moves.

## Proposal

Move the shared design code out of VxHub into two libs. VxHub and VxAdmin each
build on them. In VxAdmin, design is a system administrator only area behind a
feature flag.

For now VxAdmin holds one election at a time, design included. Holding several
elections in VxAdmin is a later project.

### Packages

```
apps/hub/{backend,frontend}           apps/admin/{backend,frontend}
                  \                       /
libs/election-definition-backend, libs/election-definition-ui
```

Both apps depend on both libs. Neither lib depends on an app.

### What's shared and what isn't

In general I'm trying to share where its easy but not hesitate too much to just
duplicate when it starts to feel forced to share. As implementation progresses
the exact line here may shift.

**Shared, in `libs/election-definition-backend`:**

- `ElectionDesignMethods`, the API type `libs/election-definition-ui` calls.
  Each app's design API must satisfy it;
- input parsing and validation helpers, one per write (e.g.
  `prepareCreatePrecinct`). They parse the input and run the shared validators,
  which produce the error codes the UI shows. They do no I/O.
- rendering and export, other main chunks of business logic

**Shared, in `libs/election-definition-ui`:** the design screens, hooks and
routes. Each app wraps them in a `DesignProvider` with explicit props:

```tsx
<DesignProvider
  apiClient={apiClient}
  basePath="/design"
  navScreen={ElectionNavScreen}
  header={Header}
  saveFile={saveFileToUsb}
  reportError={logError}
/>
```

**Per app:**

- the design API methods. Each app writes its own: call the shared helper, then
  its own store, then log. Most are one-line store calls;
  - this could be shared, with per-app middleware handling the logging but that
    would probably make logging on vxadmin-side annoying to work with for not
    much value.
- store db implementation
- auth, logging and file I/O;
- background job running: queueing, progress tracking and crash recovery. VxHub
  keeps its Postgres task queue and worker; VxAdmin runs one export at a time
  and tracks it in SQLite. Both call the shared export function, which reports
  progress through a callback.

### Preventing Drift

One shared test suite runs against each app's design API methods (without auth),
along with the validator tests. It checks what the UI relies on: error codes,
ordering and round trips. Any new shared behavior gets a test in that suite.

### Data

- **VxAdmin: SQLite.** The design tables live in VxAdmin's existing `data.db`
  and `schema.sql`, alongside the tally data. VxAdmin doesn't need Postgres.
- **VxHub: Postgres,** unchanged.
- **Unconfigure** wipes the design tables with everything else.
- **Backups** include design data, since it's in `data.db`.

### Feature flag and rollout

`ENABLE_ADMIN_ELECTION_DESIGN` gates the whole feature. When it's off, VxAdmin
doesn't mount the design API and hides the nav item.

Code moves slice by slice: each slice moves one feature's code from VxHub into
the libs (a no-behavior-change refactor for VxHub) and wires the same feature
into VxAdmin behind the flag. Full flow will not work until all core screens are
moved.

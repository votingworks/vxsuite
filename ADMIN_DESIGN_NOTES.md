# VxAdmin ballot design: scratch branch notes

Scratch branch `caro/admin-design-scratch-8e1aa9`. Not for merging.

## Step 1: how to share code between VxHub and VxAdmin

Facts that shape the options:

- Hub's design store is one 3.7k-line Postgres `Store`, constructed from
  `DATABASE_URL`, with 51 node-pg-migrate migrations. Elections belong to a
  jurisdiction, and the jurisdiction's `state_code` drives template, default
  system settings and feature flags.
- Hub auth is one grout `before` middleware (`checkAuthorization` in
  `apps/hub/backend/src/app.ts`). API methods have almost no auth code inside.
- Hub frontend screens already get their client from an `ApiClientContext`, but
  the hooks in `api.ts` are typed against hub's `Api`. 13 screens read `getUser`
  / `getUserFeatures` / `getStateFeatures`.
- Hub-backend's dependency tree includes Auth0, Sentry, S3, Google Cloud, Slack
  and CircleCI clients.
- Postgres 15 is installed on this dev box. Your earlier prototype
  (`vxdesign-admin-finalize`) already ran hub's backend, worker and frontend
  inside VxAdmin under `/design`.

### Options

|                                                                                         | Effort                             | Cert surface                                     | Drift                       | Coupling                                        | Test story                              |
| --------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------ | --------------------------- | ----------------------------------------------- | --------------------------------------- |
| A. Admin depends on hub packages directly                                               | S                                  | Worst: all of hub's cloud deps                   | None                        | High: every hub change touches admin            | Hub's tests, plus admin glue            |
| E. Embed the whole hub app under `/design` (your prior prototype)                       | S, mostly done before              | Worst                                            | None                        | High; two SPAs, two shells                      | Same as A                               |
| B. Extract `libs/design-backend` and `libs/design-ui`; hub and admin become thin shells | M–L                                | Only the design libs plus pg and the editor deps | None                        | Low: injected API, auth and a features provider | Hub's existing tests move with the code |
| C. Fork/copy screens and store into admin                                               | M                                  | Only what's copied                               | High, forever               | None                                            | New tests in admin                      |
| D. Pure-function core over `Election`; each app keeps its own persistence               | L for UI (still needs B's UI work) | Smallest                                         | Low in logic, high in store | Low                                             | New store tests in admin                |

D is the fallback if Postgres on VxAdmin is ruled out.

### Recommendation: B, done incrementally

- **Backend:** move hub's `Store`, `db/`, migrations and the design API methods
  into `libs/design-backend`. Expose
  `createElectionDesignApi({ store, logger, features })`. Hub keeps Auth0, orgs,
  S3, Slack, live reports and its `checkAuthorization`. Admin wraps the same API
  with an SA-only middleware.
- **State and features:** admin keeps one local jurisdiction. The "choose state"
  setting writes its `state_code`, so hub's state profile works unchanged.
- **Frontend:** move screens one tab at a time into `libs/design-ui`. A
  `DesignContext` provides the API client, features and a route base path, in
  place of `getUser` / `getUserFeatures`.
- Each move is a hub refactor PR with hub's tests still passing. Pieces can be
  extracted one at a time.
- For this scratch branch: move code out of hub where that's quick. Where
  untangling would take too long, admin imports from hub directly (option A),
  and the notes record each shortcut.

### Postgres on VxAdmin: machine-image work (not done here)

- `vxsuite-build-system`: install `postgresql` in the inventories, then enable
  and start the service and create the role and database. This follows
  `scripts/build-cacvote-apps.sh` `configure_postgresql`.
- The data directory lives outside the admin workspace. It therefore survives
  unconfigure and restore without code changes.
- Run migrations at backend startup. This also gives drafts an upgrade path,
  which SQLite `libs/db` lacks.
- Cert: Postgres becomes a new COTS component. Decide whether drafts go into
  VxAdmin backups (`pg_dump`).

## Commits

(none yet)

## Open questions

## Hacked vs production-ready

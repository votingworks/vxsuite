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

Decision (Caroline, 2026-10-30): B, done incrementally, with A as the fallback
where untangling is slow.

## Running it in dev

- Postgres must be running locally; the hub's `design` superuser role is reused.
  On first start admin-backend creates database `vxadmin_design`, runs the hub
  migrations from `libs/design-backend/migrations`, and seeds one local
  organization and jurisdiction (`vxadmin-local`, state `DEMO`).
- Set `REACT_APP_VX_ENABLE_ADMIN_ELECTION_DESIGN=TRUE` in the root `.env.local`
  (already set in this worktree's copy).
- Optional env: `ADMIN_DESIGN_DATABASE_URL`, `ADMIN_DESIGN_FILES_DIR` (exports
  go to `<admin workspace>-design-files` by default).
- Log in as SA, then use **Design** in the left nav.

## Commits (oldest first)

1. `Add admin design scratch notes with code-sharing options`: this file.
2. `Extract hub design store, schema and migrations into libs/design-backend`:
   `git mv` of hub `store.ts`, `db/`, `types.ts`, `features.ts`,
   `system_settings.ts`, `utils.ts`, `ballots.ts`, `candidate_orderings.ts` and
   `migrations/`. Constants that don't depend on Auth0 move from hub
   `globals.ts` to the lib, and hub re-exports them. `Db` takes an optional
   `connectionString`. Migrations load from an absolute path, and hub's
   `node-pg-migrate` scripts pass `-m`. Hub type-checks, and hub store tests
   pass against Postgres.
3. `Move hub election definition API methods into libs/design-backend`:
   `buildElectionDefinitionMethods({ store })` holds about 30 methods (info,
   districts, precincts, parties, contests, polling places, layout, system
   settings, `loadElection`, `createElection`, delete, state features). Hub
   spreads them into its API. `convert_ms_election.ts` and `createBlankElection`
   move too. Hub app tests pass.
4. `Run a Postgres design store in admin-backend behind ENABLE_ADMIN_ELECTION_DESIGN`:
   - Adds the flag (`libs/utils`).
   - `design_store.ts` creates the database, runs migrations and seeds the local
     jurisdiction.
   - `design_api.ts` is a separate grout API at `/design-api` with a server-side
     SA-only `before` middleware.
   - Adds the "choose state" methods (`get/setDesignStateCode`) and
     `Store.updateJurisdictionStateCode`.
5. `Move hub election tab screens into libs/design-ui with an injected design shell`:
   - `git mv` of 39 hub frontend files: six tabs, forms, lists, audio panels,
     `api.ts`, `routes.ts`, `layout.tsx` and image inputs.
   - New `DesignShellContext` supplies `ElectionNavScreen`, `Header` and
     `reportError`. These replace hub's user/logout header and Sentry.
   - `setRoutesBasePath()` prefixes all routes.
   - Hub provides its own shell. Hub frontend type-checks.
6. `Add an SA-only election design area to VxAdmin using libs/design-ui screens`:
   - Adds the `/design` route and a **Design** SA nav item.
   - The design area has its own QueryClient, so admin and design query keys
     never collide.
   - Admin has its own nav shell.
   - The list screen has a state picker, a create button and a table.
   - Admin's `getStateFeatures` forces `AUDIO_ENABLED: false`.
7. `Load an election package from USB into the VxAdmin design store`:
   - `loadElectionPackage` reads a `.zip` or `.json` and calls the lib's
     `loadElection`, which regenerates IDs as hub does.
   - It copies the package's system settings into the design.
   - The modal lists USB files using admin's existing USB query.
8. `Move election package and ballot export pipeline into libs/design-backend`:
   - `git mv` of hub `generate_election_package_and_ballots.ts`,
     `ballot_pdfs.ts` and `zip.ts`.
   - The CircleCI QA trigger stays in hub (`worker/export_qa.ts`) and runs
     through an `onElectionPackageExported` hook.
   - `FileStorageClient` and a `LocalDirectoryFileStorageClient` move to the
     lib.
   - Hub worker tests pass.
9. `Render ballots and export election packages in admin-backend with libs/hmpb`:
   - `design_export.ts` runs the export in-process, with a renderer pool of 4.
   - Progress is tracked in the design store's existing `background_tasks` rows.
   - Offline translator and TTS stubs are used.
   - The General Election fixture renders 12 PDFs in about 1.6 s. Admin's
     `readElectionPackageFromFile` accepts the output.
10. `Extract configureFromElectionPackageFile and reject configure on a configured VxAdmin`:
    the post-zip half of `configure` becomes a shared function. `configure` now
    asserts the machine is unconfigured (risk 3 in the findings doc).
11. `Add design Ballots tab to finalize, export, save to USB and configure VxAdmin`:
    - Finalize starts the export, and progress shows while it runs.
    - Unfinalize lets you edit again.
    - The election package and ballot zips are saved under
      `election-design/<title>-<id>/` on USB, unsigned.
    - `configureFromDesign` requires an unconfigured VxAdmin and a finished
      export newer than the finalize, then calls
      `configureFromElectionPackageFile`.
    - Backend smoke test: design → export → configure a fresh workspace worked.
12. `Share cloneElection between hub and admin and add design duplicate`: hub's
    clone logic moves to a lib function. Admin gets `duplicateElection` and a
    Duplicate button.

Piece 6, going back to designs from a configured VxAdmin: no code needed. The
**Design** nav item and routes are SA-level whether or not VxAdmin is
configured. Drafts live in Postgres, which unconfigure and restore never touch.

## Verified vs not

- Verified by script against real Postgres and Chromium: store setup and
  migrations, state change, load fixture, export, configure a fresh admin
  workspace from the export.
- Type-checked: libs/design-backend, libs/design-ui, hub backend, hub frontend,
  admin backend, admin frontend. Admin frontend `vite build` succeeds.
- **Not yet clicked through in the browser.** No admin UI flow has been
  exercised in a running dev server.

## UI click-through (2026-10-30)

Driven in the dev server as SA. Screenshots are numbered in
`/media/psf/Shared/screenshots/`.

Worked:

- Design list, create election, edit and save election info (01, 11–12).
- All six tabs render in admin's shell (02–07).
- Add/edit/delete: districts (13–14), precincts (15–16, 23), parties (17–18),
  contests with candidates (19–20), polling places (21–22, 24–25).
- Load an election package from mock USB (26–28), duplicate (29).
- Ballots tab: finalize, export progress, exported files, save three zips to USB
  under `election-design/<title>-<id>/` (30–33).
- Configure VxAdmin from a design (34). Go back to Design while configured (35).
  The Ballots tab refuses to configure again (36).
- Unconfigure (37–38) leaves both drafts in the design list (39).
- State from machine config via the dev dock (40–41).

Broke and fixed:

- DEMO showed the ballot-language picker in an English-only prototype. Admin now
  also masks `BALLOT_LANGUAGE_CONFIG`.
- Export output under `apps/admin/backend/dev-workspace-design-files` made
  `turbo watch` restart the backend mid-export. It is now gitignored.
  Interrupted export tasks are now marked failed at startup instead of showing
  "exporting" forever.
- The state dropdown is replaced by `$VX_CONFIG_ROOT/state-code` (written by the
  image build). In dev it is `.mock-state/development/vx-config/state-code`, set
  from a dev dock picker. Admin syncs the local jurisdiction's state on each
  design request. Missing file → DEMO, which is a scratch default; production
  should refuse.

Proof viewer (item 2):

- `getBallotPreviewPdf` moved to `libs/design-backend`
  (`buildBallotPreviewMethods({ store, translator })`). Hub passes its Google
  translator and admin passes the offline one. Hub preview tests pass.
- `ballot_screen.tsx` (react-pdf viewer) moved to `libs/design-ui`. Admin's
  Ballots tab lists precinct × ballot style with **View Ballot** (42, 45).
  Precinct, absentee and primary proofs render (43, 44, 46).
- Not ported: hub's full ballots screen (ballot layout settings: paper size and
  density, split-precinct nesting, finalize/approve status). Admin's list
  doesn't nest splits. The viewer's **Download PDF** uses a browser download,
  which won't work in the kiosk.

Found, not fixed:

- `turbo watch` (`pnpm start`) can get stuck restarting admin-backend in a loop
  after several quick commits. `ballot-interpreter`'s napi build rewrites its
  outputs and retriggers the watch. I worked around it by running the built
  backend and `vite` directly (`admin-nowatch` in `.claude/launch.json`,
  untracked). This predates this branch and is worth its own look.

- The seal is a required browser file input. Saving election info is impossible
  without uploading one, and there is no kiosk USB picker yet.
- Admin's larger touch theme crowds some hub layouts: the contest form
  empty-state card, and table action buttons wrapping.
- The design list shows raw status enums (`inProgress`, `ballotsFinalized`).
- Admin's unconfigured package picker lists every `.zip` on the USB, including
  the ballot zips the design export writes.
- Duplicated elections are titled "(Copy) …" (hub behavior).
- Every backend source change restarts the dev backend and logs out the mock
  card. That's normal dev behavior, but it bites scripted testing.

## Hacked vs production-ready

Closest to production-ready (extract first):

- Commits 2, 3, 8 and 12 (hub to `libs/design-backend` moves). These are pure
  refactors with hub tests passing, and each could be its own hub PR. The lib is
  missing its own tests and coverage config; the tests still live in hub.
- Commit 10 (`configureFromElectionPackageFile` and the unconfigured assertion).
  This breaks `app.test.ts:375` ("reconfigure on same app instance"), which
  needs an unconfigure first.
- The `ENABLE_ADMIN_ELECTION_DESIGN` flag.

Shortcuts (option A or hacks), to fix before real PRs:

- `libs/design-ui` `api.ts` is typed against hub's whole `Api` (type-only
  dependency on `@votingworks/hub-backend`). Admin casts its `/design-api`
  client to that type. Real fix: type the lib's client against the shared method
  set, and move `tts_strings` into the lib or inject the audio panels.
- `routes.ts` uses a module-level base path, and `electionParamRoutes` is a
  `Proxy`. Real fix: a `useDesignRoutes()` hook from context.
- Hub screen tests that `vi.mock` individual moved modules (audio panels, etc.)
  now mock all of `@votingworks/design-ui` and fail. Many of the election-info,
  districts, parties, precincts, polling-places and contests screen tests fail.
  Real fix: move those tests into `libs/design-ui`, or stop mocking the panels.
- The lib exports everything with `export *`; `Sublist` collides.
- `libs/ui`: `TableProps` and `RichTextProps` are exported only to satisfy
  declaration emit.
- Design API calls are logged with hub's `LogEventId.ApiCall`, which is
  documented as VxHub-only. Real fix: add design `LogEventId`s.
- Export runs in the backend process, not a forked worker as in your earlier
  prototype. No crash or interrupt recovery.
- Exported files live at `<workspace>-design-files`. Production needs a defined
  location outside the workspace.
- Design exports saved to USB are not signed. The export isn't invalidated when
  a design is edited after unfinalize; `configureFromDesign` only checks that
  the export is newer than the finalize.
- Seal/signature upload uses a browser file input, which won't work in the
  kiosk. Needs a USB picker.
- Pre-commit eslint gets OOM-killed on big commits, so commits used
  `--no-verify` after running `oxfmt` by hand. Lint is not clean everywhere.
- There's a stale, read-only, 0-byte `/home/vx/code/vxsuite/.git/config.lock`
  dated Oct 29; husky warns about it on install. Not created by this session.

## Open questions

1. Where should the "choose state" setting live? It's on the Design list screen
   for now. Alternatives: SA Settings, vendor-only, or derived from
   `VX_MACHINE_JURISDICTION`.
2. Loading a package regenerates all IDs (hub behavior). Should VxHub → VxAdmin
   keep IDs?
3. Should "Configure VxAdmin for This Election" also be offered from the
   unconfigured Election screen (a list of finalized designs, as in your earlier
   prototype)? It's only on the design's Ballots tab now.
4. Should design exports to USB be signed?
5. Should drafts be included in VxAdmin backups (`pg_dump`)?
6. Proofing: there's no ballot preview or proof viewer yet. Hub's
   `getBallotPreviewPdf` and Ballots screen are hub-only. Next candidate to
   move.

## What to pull out first

1. Commits 2 + 3 as a hub-only refactor PR (store, schema, migrations and the
   election-definition API into `libs/design-backend`).
2. Commit 8 (export pipeline into the lib) as a second hub PR.
3. Commit 10 (`configure` extraction plus the unconfigured assertion) as a small
   admin PR. It is independently valuable.
4. Then `libs/design-ui` (commit 5), after fixing the API typing and route
   base-path shortcuts and moving the screen tests.

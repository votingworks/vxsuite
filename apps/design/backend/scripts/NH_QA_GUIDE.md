# NH State Primary 2026 — Ballot & Election Package QA Guide

This guide explains how to regenerate and QA the NH state primary deliverable,
and how to make changes and reproduce the final output.

All work happens on the `jonah/nh-primary-proofs` branch, in
`apps/design/backend`. The NH scripts live in `apps/design/backend/scripts/`.

---

## 1. What the deliverable is

For each town we produce a set of ballots plus (for machine-scanned towns) a
VxDesign **election package**.

- **Ballot types:** `precinct`, `absentee`, `uocava`, `foo`
  (federal-office-only), `sample`.
  - `uocava` and `foo` are **single-page, no timing marks, no QR**
    (field-printed, hand-counted).
  - `precinct` / `absentee` are the normal 2-sided scannable ballots.
- **Two kinds of towns**, determined by the source folder they come from:
  - **VotingWorks** (machine-scanned) → get an election-package `.zip`.
  - **Hand Count** → ballots + ROV forms only, **no package**.
- **Return of Votes (ROV)** forms: one per town/ward per party.

There are ~182 towns (72 VotingWorks + 110 Hand Count).

---

## 2. One-time setup

From the repo root:

```sh
pnpm install

# Build the libraries the scripts depend on (hmpb, backend, types, …).
# Do this once, and again any time you change library source (see §6).
pnpm --filter @votingworks/design-backend... build
```

Also make sure these CLI tools are available (used by the local smoke test):
`unzip`, `pdftoppm` (poppler-utils).

**How the scripts run:** there is no `ts-node`/`tsx` in this repo, so the NH
scripts are run through a small loader, `apps/design/backend/.nh_ts_loader.cjs`,
which transpiles TypeScript on the fly. Every command below is run **from
`apps/design/backend`** in the form:

```sh
node -r ./.nh_ts_loader.cjs scripts/<script>.ts <args…>
```

---

## 3. Source data

The scripts read NH's exported ballot-style JSON files. Point them at the folder
that contains the drop.

Example (Jonah's machine): `/media/psf/VMSharing/NH State Primary 2026`

A town's **name** comes from the `AVSInterface.HeaderInfo.TownName` field inside
each JSON file (not the filename). A town's **variant** (VotingWorks vs Hand
Count) is inferred from the folder name.

Always start by checking the inventory looks right:

```sh
node -r ./.nh_ts_loader.cjs scripts/nh_delivery.ts "<SOURCE_DIR>"
```

Expect: `VotingWorks: 72 towns … HandCount: 110 towns`, 0 missing parties, 0
superseded. If the VW/HandCount split looks wrong, the folder names aren't being
recognized — see §6.

---

## 4. Regenerating the deliverable

Pick any output directory you like for `<OUT>` (e.g. `~/nh-out`). You can
regenerate **all** towns, or filter to a single town by name substring (fast,
great for iterating).

### Proofs (watermarked, for review) — `render_nh_batch`

```sh
# all towns (parallel, a few minutes)
node -r ./.nh_ts_loader.cjs scripts/render_nh_batch.ts "<SOURCE_DIR>" "<OUT>"

# one town
node -r ./.nh_ts_loader.cjs scripts/render_nh_batch.ts "<SOURCE_DIR>" "<OUT>" "dover"
```

### Finals + election packages — `render_nh_election_package`

```sh
# all towns (sequential per town, ~20-30 min)
node -r ./.nh_ts_loader.cjs scripts/render_nh_election_package.ts "<SOURCE_DIR>" "<OUT>"

# one town
node -r ./.nh_ts_loader.cjs scripts/render_nh_election_package.ts "<SOURCE_DIR>" "<OUT>" "bedford"
```

- Finals are **unwatermarked**; VotingWorks towns also get a `.zip` package.
- Hand-count towns produce ballots + ROVs only (the run prints `(no package)`).

**Determinism:** the same source produces byte-identical packages (and hashes).
So re-running never changes a VW package unless that town's source data changed
— which means QA results stay valid across regens.

### Output structure

```
<OUT>/
  ballots/
    precinct/  absentee/  uocava/  foo/  sample/     each: DEM/  REP/
  rov/
    DEM/  REP/
  election-packages/                                  (finals only)
    <Town> - election-package-<hash>.zip
  qa-summary.txt   qa-results.json                    (after QA, §5)
```

Filenames are `"<Town or Ward> - <PARTY> - <type>.pdf"`. (Note: `&`, `.`, and
apostrophes are stripped from filenames — the on-ballot text is unaffected.)

To eyeball a ballot without a PDF viewer:

```sh
pdftoppm -png -r 150 -f 1 -l 1 "<OUT>/ballots/precinct/DEM/Dover Ward 1 - DEM - precinct.pdf" /tmp/page
```

---

## 5. QA'ing the election packages

### a) Local smoke test (do this first)

Validates every package's zip entries, ballot hash, v4.0 shape, and decodes the
QR from each encoded ballot to confirm it matches the ballot hash:

```sh
node -r ./.nh_ts_loader.cjs scripts/smoke_test_nh_package.ts "<OUT>"
```

Expect `72 package(s) checked. ALL CHECKS PASSED ✓`.

### b) VxQA on CircleCI — `trigger_nh_qa_batch`

Uploads each package and runs the vx-qa pipeline, polling to completion. Writes
`<OUT>/qa-summary.txt` and `qa-results.json`.

Requires these env vars: `CIRCLECI_API_TOKEN` (VxQA Admin token),
`AWS_S3_BUCKET_NAME`, `AWS_S3_REGION`, and AWS credentials.

```sh
node -r ./.nh_ts_loader.cjs scripts/trigger_nh_qa_batch.ts "<OUT>" --max-inflight 10
```

- `--max-inflight 10` caps concurrent pipelines so shared CI isn't saturated.
- After it finishes, add clickable report links to the summary without
  re-running anything:
  ```sh
  node -r ./.nh_ts_loader.cjs scripts/trigger_nh_qa_batch.ts "<OUT>" --refresh
  ```
  (Report links are CircleCI artifact URLs — open them while logged in to
  CircleCI.)

---

## 6. Making changes and reproducing

### Fixing a town / place name (source-data change)

Edit the `AVSInterface.HeaderInfo.TownName` field in the source JSON. **Edit
every copy of that town** — both parties (DEM + REP) and both drop folders (e.g.
`Hand Count/` and `Hand Count 7-6/`). No rebuild needed (source-only). Then
regenerate just that town:

```sh
node -r ./.nh_ts_loader.cjs scripts/render_nh_election_package.ts "<SOURCE_DIR>" "<OUT>" "<town filter>"
```

Tip: to confirm which files hold a given town,
`grep -rl "TOWN NAME" "<SOURCE_DIR>"`.

### Changing ballot or ROV layout (library-code change)

Ballot/ROV rendering lives in `libs/hmpb/src/`:

- ROV write-in rows per contest: `WRITE_IN_BLANK_ROWS` in
  `libs/hmpb/src/ballot_templates/nh_rov_form.tsx`.
- NH state ballot layout: `libs/hmpb/src/ballot_templates/nh_state_*`.

The scripts import the **built** `@votingworks/hmpb`, so after any change under
`libs/hmpb/` you must rebuild before re-running a script:

```sh
pnpm --filter @votingworks/hmpb build:self      # fast rebuild
```

Then regenerate (a single town, or all).

If you change ballot rendering, also update and run the visual-regression
fixtures so tests stay green:

```sh
cd libs/hmpb
pnpm generate-fixtures --nh-state-primary-election --nh-state-general-election
pnpm test:run src/ballot_fixtures_nh_state_primary_election_fixtures.test.ts \
              src/ballot_fixtures_nh_state_general_election_fixtures.test.ts
```

### Fixing variant (VotingWorks vs Hand Count) detection

Folder-name recognition is in `variantFromPath` in `scripts/nh_delivery.ts`. It
currently matches `VotingWorks`/`voting-works` and `Hand Count`/`hand-count`. If
a future drop uses different folder names, add them there. Re-check with the
inventory command (§3) — the VW/HandCount counts must be right, because it
decides which towns get scannable packages.

---

## 7. Reproducing the current final output end-to-end

```sh
cd apps/design/backend
SRC="<SOURCE_DIR>"
OUT="<OUT>"

# 1. sanity-check the source
node -r ./.nh_ts_loader.cjs scripts/nh_delivery.ts "$SRC"

# 2. finals + packages (all towns)
node -r ./.nh_ts_loader.cjs scripts/render_nh_election_package.ts "$SRC" "$OUT"

# 3. validate locally
node -r ./.nh_ts_loader.cjs scripts/smoke_test_nh_package.ts "$OUT"

# 4. run VxQA (needs the env vars from §5b)
node -r ./.nh_ts_loader.cjs scripts/trigger_nh_qa_batch.ts "$OUT" --max-inflight 10
```

Proofs are the same but with `render_nh_batch.ts` (steps 2 only; no packages).

---

## Gotchas

- **Rebuild hmpb after any `libs/hmpb` change** — scripts use the built package,
  not the source.
- **Full finals runs are slow** (sequential per town). Use a town filter while
  iterating; run the full set once at the end.
- **VW towns get packages; hand-count towns don't** — this is driven entirely by
  the source folder name, so double-check the inventory split after any source
  reshuffle.
- **Output dirs are yours to choose** and are safe to delete/regenerate; the
  source data is the source of truth.

# NH Election Package for VxQA — Plan / Handoff Notes

**Status:** BLOCKED on QR version skew (2026-07-08). Script complete and
generates valid v4.0 packages for Bedford + Claremont (staged to
`VMSharing/nh-election-packages-for-brian/`), but Brian's v4.0.7 scan failed
with `invalidQrCodeMetadata`.

**Blocker:** the ballot-encoder QR format changed between v4.0.7 and main (PR
#8745 prelude `V P 2`→`V B 1`; PR #8800 index widths 12→13/16 bits), and
`encodeHmpbBallotPageMetadata` is NOT parameterized by the serialization
version. So main renders new-format QR regardless of the v4.0 election
serialization, and a v4.0.7 build can't decode it. Fix requires generating on a
codebase whose ballot-encoder matches Brian's scanner (his
`v4.0.7/primary-election` branch — NH work isn't in the v4.0.7 tag) OR making
the QR encoding version-aware. Same latent issue affects any v4.0-targeted
export from main VxDesign. Next session.

## Task

From Arsalan (Slack `C08N5UTSDU5` p1783531905468669): share with **Brian** a
representative pairing of a **ballot PDF + election package** for his
`v4.0.7/primary-election` VxQA work. Wants **one town + one city**. Needed ~next
week. Delivery: **Jonah stages / sends himself** (I prepare, don't send).

## Decisions (locked with Jonah)

- **Approach:** standalone script that runs our converted per-town `Election`
  through the real hmpb pipeline and assembles a spec-complete v4.0 election
  package. (Not: importing into a VxDesign Postgres instance.)
- **Town:** BEDFORD (single-precinct). **City:** CLAREMONT (3 wards). Both from
  the **VotingWorks** set (the path VxQA exercises).
- **Ballot modes in package:** official + sample (no test). This matches what
  our proofs script emits.
- **ROV forms:** yes, rendered _alongside_ the package (not inside the zip —
  they aren't ballots).
- **Software version:** v4.0 (NH towns are all on v4.0).
- **Watermark:** NONE (production ballots are un-watermarked; do not carry over
  the proofs script's `PROOF` watermark).

## Source data

New drop extracted at: `<scratchpad>/new-drop/` (the "NH State Primary 2026 -
updated" ZIPs). Content is byte-identical to the prior "Organized By Arsalan"
drop (verified earlier this session) — pure repackaging, so either delivery
works as input.

## Implementation

**File:** `apps/design/backend/scripts/render_nh_election_package.ts` (written).

Per-town pipeline (mirrors the VxDesign export worker
`apps/design/backend/src/worker/generate_election_package_and_ballots.ts`, minus
Postgres/CircleCI):

1. `convertNhElection(townFiles)` → `Election`.
2. **Auto-fit paper size** (probe largest ballot style; smallest size with no
   back-page bubble) and bake into `election.ballotLayout.paperSize` — the
   package path does NOT auto-fit.
3. `addPollingPlacesForExport(election, { stateCode: 'NH' })` — NH generates
   polling places from precincts; our converter leaves them empty.
4. `getAllStringsForElectionPackage(election, stubTranslator, hmpbStringsCatalog, [{languages:['en']}])`
   — English-only never calls the translator (no GCP creds). Then
   `ballotStrings = mergeUiStrings(electionStrings, hmpbStrings)`.
5. `formatElectionForExport(election, ballotStrings)`.
6. `createBallotPropsForTemplate('NhStateBallot', election, false)` → filter to
   `official`+`sample` → set `isHandCount` per town variant (matrix never sets
   it; both our examples are VotingWorks → false). No watermark.
7. `renderAllBallotPdfsAndCreateElectionDefinition(pool, ballotTemplates.NhStateBallot, props, { format:'vxf', version:'v4.0' })`.
8. Assemble deterministic zip (fixed date) with the 8 standard entries:
   `metadata.json`(=LATEST_METADATA), `appStrings.json`, `election.json`
   (=`electionDefinition.electionData`), `systemSettings.json`
   (=DEFAULT_SYSTEM_SETTINGS), `registeredVoterCounts.json` (={}),
   `ballots.jsonl` (base64 `EncodedBallotEntry` per PDF). Name:
   `election-package-${formatElectionHashes(ballotHash, sha256(zip))}.zip`.
9. Also write loose ballot PDFs (`getBallotPdfFileName`) + ROV PDFs per style.

**Key v4.0 facts:** `format:'vxf'` required (`cdf` is asserted incompatible with
v4.0). v4.0 serializer renames `jurisdiction`→`county`, flattens `gridLayouts`,
converts >2-option yesno→candidate. `ballotHash = sha256(electionData)`.

**Reuse imports:** `@votingworks/hmpb` (render pipeline, pool, templates,
`hmpbStringsCatalog`), `@votingworks/backend`
(`getAllStringsForElectionPackage`), `@votingworks/types`
(`DEFAULT_SYSTEM_SETTINGS`, `LATEST_METADATA`, `ElectionPackageFileName`,
`EncodedBallotEntry`, `mergeUiStrings`, `formatElectionHashes`), and
design-backend internals `../src/ballots` (`addPollingPlacesForExport`,
`formatElectionForExport`, `createBallotPropsForTemplate`) + `../src/utils`
(`getBallotPdfFileName`).

## How to run (no tsx/ts-node in repo)

esbuild bundling does NOT work here: `convert_nh_election.ts` and
`nh_delivery.ts` each have `if (require.main === module) main()` blocks, and an
esbuild CJS bundle makes ALL of them fire at import time (ESM-hoisted, shared
`require.main`/`module`). `convert_nh_election.main` then tries to read the
delivery dir as JSON → EISDIR.

Fix: a per-file `require.extensions` transpile hook (real CJS semantics, so only
the true entry's `require.main === module` fires). Loader lives at
`apps/design/backend/.nh_ts_loader.cjs` (untracked). Run from the backend dir:

```sh
cd apps/design/backend
node -r ./.nh_ts_loader.cjs scripts/render_nh_election_package.ts \
  <delivery-dir> <out-dir> BEDFORD
```

(Was about to run this for BEDFORD when we paused. Output dir target:
`<scratchpad>/brian-handoff/`.)

## Remaining steps

1. Run BEDFORD PoC; confirm it produces the zip + PDFs without error.
2. **Verify round-trip:** feed the generated zip to the canonical reader
   `readElectionPackageFromBuffer`
   (`libs/backend/src/election_package/election_package_io.ts:81`) — must parse
   as valid v4.0 election, all entries present, `ballots.jsonl` decodes, and the
   election's `ballotHash` matches what's embedded in the PDF QR/text. This is
   the real "production quality" gate.
3. Run CLAREMONT (multi-ward city).
4. Stage handoff: `brian-handoff/BEDFORD/` and `.../CLAREMONT/` each with the
   package zip + ballots/ + rov/. Show Jonah before he sends.
5. Productionize: decide whether to keep the `.nh_ts_loader.cjs` approach or add
   a proper package.json script; add a unit test (100% coverage is required in
   this repo — CI will enforce); `pnpm lint`; `/mutation-test` for any new test.

## Open risks / notes

- `addPollingPlacesForExport` is called with a `{stateCode:'NH'}` stub cast —
  audit confirmed only `stateCode` is read, but verify at runtime.
- appStrings catalog is resolved relative to the built `@votingworks/backend`
  module; confirm it resolves when run via the loader (should, inside monorepo).
- Coverage: this is a `scripts/` file; check how the other NH scripts satisfy
  the 100% coverage gate (they use `/* istanbul ignore next */` on the
  `require.main` block) and mirror that.
- Per-town = per-package: each town is its own Election → own ballotHash → own
  `election-package-*.zip`. Loop per town.

## Related artifacts

- Inventory tool (reused this session): `scripts/nh_delivery.ts`
  (`printInventory`).
- Batch proof renderer (source of auto-fit + variant logic):
  `scripts/render_nh_batch.ts`.
- Converter: `scripts/convert_nh_election.ts` (`convertNhElection`,
  `NhBallotStyleSchema`).

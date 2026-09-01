# VxCentralScan Networking

**Author:** @caroline

**Status:** `planning`

## Existing Discussion

- [#9027 VxCentralScan: networking](https://github.com/votingworks/vxsuite/issues/9027)
- [#9063 99% scale estimates](https://github.com/votingworks/vxsuite/issues/9063)
- [Spec 0002: Multi-Station Adjudication](0002-multi-station-adjudication.md)
  (the networking stack this builds on)
- Prototype: `ca-demo` branch (#8368; PRs #8882, #8902, #8960, #8968);
  [prototype discussion thread](https://votingworks.slack.com/archives/CEL6D3GAD/p1783461283723059)
- [Slack: VxAdmin hardware sizing for SCC](https://votingworks.slack.com/archives/C097E0MA75F/p1785879308503099)
  (host storage/NIC scale details live on this track)

## Problem

VxCentralScan CVRs reach VxAdmin only by USB today. For large central-scan
jurisdictions shuttling USB drives is slow and error-prone and delays
adjudication and results, having networked central-scanners is table-stakes for
these jurisdictions.

## Scale

From https://github.com/votingworks/vxsuite/issues/9063 we should target support
for:

Initial Deployment - up to 600,000 sheets/cvrs total. ~25,000 CVRs per
VxCentralScan Maximum Election - up to 3.2M sheets/cvrs total. ~120,000 cvrs per
VxCentralScan

Per-Scanner numbers are determined by assuming 70% of CVRs are centrally-scanned
and semi-evenly divided up amongst ~20 machines.

VxCentralScan batches will generally max out around 500 sheets/batch but could
theoretically be limitless. We could enforce a max.

## Proposal

VxCentralScan connects to VxAdmin over the private wired network built for
multi-station adjudication (spec 0002) and automatically sends each completed
batch — CVR JSON, layouts, and **both full page images** — to the host, which
**stores everything**. Because the host then holds a complete record, a
fully-synced networked scanner does not need a USB export: sync satisfies the
backup requirement. USB export remains fully supported as the fallback path.

We build incrementally: tasks 1–4 below ship a correct, secure, operator-ready
product; tasks 5–6 scale-test it against high-speed-scanner targets and drive
any speed work from measurements rather than up-front optimization.

### Configuration

Networking on VxCentralScan is a machine-level setting, mirroring VxAdmin's
`multi_station_config.ts`: enabled only when the
`ENABLE_CENTRAL_SCAN_NETWORKING` feature flag is set **and** (in production)
`$VX_CONFIG_ROOT/local-ethernet-state` contains `enable`. The environment
variable exists to enable testing the toggle in dev since the file state is hard
to manage. In production that file is written by the basic-configuration wizard
and lives on the encrypted `/vx/config` volume, so the setting **persists across
reinstalls** (vx-iso restores `/vx/config` when machine type/ID and trust state
match). When disabled, the machine behaves exactly as today — no discovery, no
sync loop, no networking UI.

### Protocol

**Discovery & registration.** The scanner browses avahi for the host's
`VxAdmin-*` peer service and calls `registerScanner` on an interval as a
heartbeat (host marks scanners offline after a timeout). Registration requires a
`codeVersion` match and a ballot-hash match, checked on **both** sides. The host
rejects an unconfigured scanner and a `machineId` already registered in another
role. Configuration over the network is left as a followup improvement.

**Transfer.** One batch = one transfer session, validated at intake and made
visible atomically at finish. The flow of one batch:

- The scanner's `cvr_sync` loop (while registered with a host) picks the oldest
  completed batch with `sent_to_admin_at` unset — strictly oldest-first, one
  batch in flight.
- `startCvrTransfer` sends the batch manifest (id, label, polling place, sheet
  count, test/official mode) plus code version and ballot hash. The host
  re-checks compatibility and the CVR mode lock, answers `alreadyComplete` if
  this `(scanner, batch)` was already imported (so a lost acknowledgment costs
  one request, not a re-upload), and otherwise writes the manifest to a
  per-batch transfer directory.
- One `POST /api/cvr-transfer/:scanner/:batch/:cvrId` per sheet — a zip of the
  CVR report JSON, layout files, and page images, built with the same code as
  the USB export. The host **fully validates each record at intake**: same
  parsing, election checks, and image hash verification as a USB import. A
  malformed record is rejected with a reason the moment it arrives. Valid
  records are inserted into a `cvrs_staging` table (image bytes staged as files)
  — invisible to every other consumer, and durable, so staged records are the
  crash/resume state. Re-sends simply replace the staged record.
- `finishCvrTransfer` reconciles the staged count against the manifest's sheet
  count, then **moves the staged records into the real tables in one short
  synchronous transaction** — batch row, import record, CVRs, write-ins, image
  rows (files move by rename). That commit is the first moment tallies,
  adjudication queues, or the CVR file list can see any of it; a failure rolls
  the whole move back. Finish is idempotent.
- The scanner marks `sent_to_admin_at` only after finish succeeds, so a crash
  anywhere earlier just means a harmless re-send.

Interruption recovery is therefore free: after any failure (host restart,
dropped connection, scanner crash) the scanner starts the same batch again,
uploads upsert over the staged records, and finish moves them. Nothing to expire
or resume, and per-ballot-id dedup at move time protects against records that
also arrived by USB.

We send CVRs one by one rather than one request per batch to keep requests small
and to spread the validation work across the transfer instead of concentrating
it at finish; the finalize transaction only moves already-validated rows (~tens
of milliseconds for a full hopper), so the host keeps responding to adjudication
stations and heartbeats throughout.

**Sending order & failure.** Batches send strictly oldest-first. A batch that
repeatedly fails stops the queue and raises a **prominent alert** on
VxCentralScan (distinct Batch History state + manual retry); transient errors
retry on a simple backoff. Incomplete imports are never auto-deleted on the
host; the recovery path is always retry-until-complete. Deleting an import on
VxAdmin does not clear sent-state on the scanner; rescanning is the recovery.

### Security

Transport security and peer authentication are provided by IPsec (strongswan,
transport mode over link-local, TPM-backed machine certs from the Vx CA, FIPS
mode) — the same posture as multi-station adjudication. The app layer stays
plain HTTP inside that boundary; only Vx-certified machines can complete the
handshake. No per-CVR signature files (the USB artifact-signature scheme doesn't
map to a streaming protocol).

### Reusing the staged-import pattern for USB imports

Today's USB import wraps the whole file in one long async transaction, which
blocks adjudication claims (nested-transaction errors), risks unrelated writes
silently joining the transaction, and stalls backups for its full duration. The
network transfer's staged-import machinery is the intended replacement shape:
read and validate records from the USB export in chunks (the per-record reader
and `prepareCastVoteRecord` are already shared), insert them into the staging
table with short transactions as they're validated, then move each file's
records into the real tables with the same atomic move used by
`finishCvrTransfer`. That gives USB imports the same properties the network path
has — no long transactions, partial state never visible to tallies or
adjudication, progress reportable to the UI, and interruptions resumable from
the durable staged rows.

### Images and the backup requirement

Today VxAdmin only stores images for ballots that require adjudication. Drew
anticipates we will want to change this in the future to always load images on
the usb path so I will plan to always send all images to VxAdmin. Whether we
make the change now or not to always store the images is left open.

Images are already stored as files outside of the the sqlite db in VxAdmin.

### Scale context (why the scale-testing tasks exist)

Enough numbers to justify the phasing; deeper host sizing (storage devices,
NIC/switch upgrades) lives on the hardware track:

- The InoTec SCAMAX DeskPro scans ~3.4 sheets/sec with a 750-sheet feeder; a
  full-image CVR is ~740KB, so a full-hopper batch is ~550MB.
- The prototype sends serially — each CVR pays the whole
  read→zip→POST→extract→import chain sequentially over a fresh connection — and
  informal testing suggests that is well below the DeskPro's production rate.
  That shape is fine to ship against Fujitsu-class scanners and small
  deployments but for maximum scale the network won't keep up with scanning.
- The eventual target: **≥3.4 CVRs/sec sustained per scanner**, up to 24
  stations concurrently (~80 CVRs/sec at the host, ~12ms per serialized import).
  This will allow the network sending to be able to keep up with scanning in the
  fastest case scenario. If we reach this speed the host is still only handling
  about 60 MB/s, the 1Gbit bottleneck in practice is about 110-120
  megabytes/sec, roughly 2× the 60 needed here, so I do not anticipate that we
  need to increase the ethernet bandwidth uplinks from the ethernet switch or
  the port capacity on the host, though if we went to a desktop for the host for
  other reasons that would be an easy upgrade.

### Work plan

1. **Online/offline indication behind `ENABLE_CENTRAL_SCAN_NETWORKING`.** Add
   the feature flag and an `isCentralScanNetworkingEnabled()` check (flag +
   `local-ethernet-state`); extract the scanner-facing peer API types into a
   small shared lib (no `central-scan-backend` → `admin-backend` dependency);
   avahi discovery of the `VxAdmin-*` service and an
   online/offline/waiting-for-host status surfaced in VxCentralScan's
   diagnostics Network section. Nothing is sent yet; when the flag is off, no
   networking code runs and no networking UI renders.

2. **Basic connection handling and status tracking with VxAdmin.**
   `registerScanner` heartbeat with `codeVersion` enforcement and ballot-hash
   matching checked on both sides; host rejects unconfigured scanners and
   machine-ID role collisions (with distinct dev-default machine IDs per app);
   `machines` table tracking with stale-machine cleanup; VxAdmin's Networked
   Scanners tab (scanner / polling place / status / last seen); statuses for
   election mismatch and multiple hosts.

3. **Happy-path batch sending after batches are saved.** The `cvr_sync`
   background loop with `sent_to_admin_at` tracking and an immediate pass on
   `saveBatch`; the three-step transfer flow (`startCvrTransfer` → per-CVR POST
   → `finishCvrTransfer`) with records validated and staged at upload and moved
   into the real tables by one atomic transaction at `finish` (import keyed
   `(scanner, batch)`, sheet-count check at finish, idempotent finish); host
   queue serializing finalizations, with file I/O outside transactions (required
   for correctness with concurrent writers); VxAdmin CVR-list treatment (source
   badges, batch-label titles, reconciled with main's `deleteCvrFile`); Batch
   History sent column.

4. **Harden error cases and retry logic in the sending path.** Strict in-order
   queue with a simple retry backoff (the retry-lands-on-the-same-import design
   from task 3 already makes interruptions safe — this task is about surfacing
   them); failed-batch alert with a distinct Batch History state and manual
   retry; operator-readable error messages; dedicated log events; clean `400`s
   and a basic size sanity cap on malformed uploads; indexed unsent-batch
   queries so the sync loop and status polling stay cheap as the DB grows;
   failure-mode test suite (concurrent uploads, restart mid-transfer,
   collisions, malformed zips, short counts).

5. **Scale-test and perf-test the sending path.** Build a harness that replays
   synthetic batches at the 99% profile (150k CVRs/scanner, ~10% flagged, up to
   24 simulated scanners at DeskPro rate, full images) against a real admin
   backend. Measure per-scanner drain rate, host import latency,
   adjudication-request latency during intake, scan throughput with sync on vs.
   off, and behavior at full DB size.

6. **Determine improvement areas and whether/where speedups are needed.**
   Candidate levers, applied in order of measured impact rather than assumed:
   HTTP keep-alive and a small pipeline of in-flight requests; store-mode
   (uncompressed) zip entries so PNGs aren't deflated/inflated for nothing;
   chunked USB imports so a concurrent USB load shares the write queue instead
   of stalling network intake and adjudication; grouping host commits within a
   session; batching multiple CVRs per request (wire-format change — last
   resort). Feed results to the hardware track (host NIC/switch uplink, storage
   layout, #9030 image-format bandwidth implications).

7. **Tweak disabling of unconfigure in VxCentralScan**

8. **Update image creation process to allow for networking on VxCentralScans**
   Extend `setup-machine.sh`'s networking branch to `central-scan`; ask the
   configuration wizard's networking question for `central-scan`; parameterize
   `vxswan.conf`'s cert name by machine type. vx-iso needs no changes.

### Schema

- VxCentralScan: `batches.sent_to_admin_at` (indexed) + per-batch send-failure
  state.
- VxAdmin: `cvr_files.source ('usb'|'network')`, `batch_labels`, `batch_ids`;
  `sha256_hash` nullable; a unique `(scanner_id, batch_id)` key for network
  imports; a `cvrs_staging` table holding validated-but-not-yet-finalized
  records (the atomic move at finish means no incomplete import record can ever
  exist, so there is no completeness flag); `machines.machine_mode` gains
  `'scanner'`; `machines.polling_place_id`. (`ballot_images` is unchanged —
  images are already files on disk; only the store-for-all-CVRs behavior
  changes.)

## Alternatives Considered

**Batched CVRs per request.** Fewer round trips, but grows host transactions
(adjudication latency blips) and coarsens retry granularity; the serial loop's
overhead is per-request latency, which pipelining addresses while keeping tiny
transactions. Reserved as a task-6 fallback.

**Flagged-only image transfer/storage.** ~90% less bandwidth and no storage
changes, but the host never holds a complete record, other features like
adjudication of any ballot, etc. may require this in the future.

**Dead-letter-and-continue on a failing batch.** Rejected for strict in-order
sending: simpler audit story, and an unimportable batch is a condition an
operator should resolve immediately, not route around.

**Whole-batch payloads / staged export transfer.** Recreates the USB import's
monolithic transaction (adjudication freeze) and monolithic failure mode.

## Open Questions

1. **Rejected-sheet images** are not transferred but are included in the
   VxCentralScan's backup still giving a unique purpose to that backup. Should
   they be transferred to admin?

## Wrap-up / Retro

_To be filled in at project completion._

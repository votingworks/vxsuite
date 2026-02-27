# Live Reports Per-Precinct Data — Design Notes

## Context

This document captures design decisions and learnings from the
`caro/lr_precinct_data` branch, which adds per-precinct tally data to the live
results reporting system. These notes are intended to inform the future
implementation of **polling places** in VxDesign.

## QR Message Format

The QR code payload encodes scanner report data. Two format versions exist:

- **V1 (legacy):** 8 fields. Field 5 is a single `precinctId` string. No
  ballot count or voting type.
- **V2 (current):** 10 fields. Field 5 is an **encoded precinct bitmap**
  (base64url). Added `ballotCount` and `votingType` fields.

Format is auto-detected by field count. Both are handled by
`decodeQuickResultsMessage(payload, election)` in
`libs/auth/src/signed_quick_results_reporting.ts`.

`extractBallotHashFromPayload(payload)` does a lightweight pre-parse to get
the ballot hash before a full decode (avoids needing the election definition
for the initial DB lookup).

## Precinct Bitmap

The bitmap is a compact encoding of which precincts have tally data. Each
precinct in `election.precincts` gets one bit, packed into uint16 values. This
is the most space-efficient way to describe per-precinct data in a QR code.

Key functions in `libs/utils/src/tabulation/compressed_tallies.ts`:

- `encodePrecinctBitmap(election, resultsByPrecinct)` — build bitmap from
  results
- `getPrecinctIdsFromBitmap(election, encodedBitmap)` — decode bitmap to
  `PrecinctId[]`
- `encodeTallyEntries({election, resultsByPrecinct, numPages})` — encode just
  the tally data (no bitmap header), split across pages if needed
- `splitEncodedTallyByPrecinct(election, precinctIds, encodedTallyEntries)` —
  split concatenated tally entries into per-precinct V0-format tallies

## Compressed Tally Formats

Two tally storage formats, auto-detected by checking the first uint16:

| Format | First uint16 | Content | Used for |
|--------|-------------|---------|----------|
| V0 | `0` (COMPRESSED_TALLY_V0) | Version byte + entries for one precinct | Single-precinct tallies, per-precinct splits |
| Bitmap | Non-zero | Bitmap header + concatenated per-precinct entries | Multi-precinct tallies (stored combined) |

`decodeAndReadCompressedTally()` handles both formats transparently.

## Database Schema

Two tables in `apps/design/backend/migrations/`:

**`results_reports`** — final reports (one row per scanner per transition):

```
PK: (ballot_hash, machine_id, is_live_mode, polls_transition)
Columns: election_id, signed_at, encoded_compressed_tally, precinct_ids
```

**`results_reports_partial`** — pages of multi-page QR reports:

```
PK: (ballot_hash, machine_id, is_live_mode, polls_transition, page_index)
Columns: election_id, signed_at, encoded_compressed_tally, precinct_ids, num_pages
```

`precinct_ids` is a NOT NULL TEXT column storing a comma-separated list of
precinct IDs that have data in the encoded tally. Empty string means "all
precincts" (legacy) or "no precinct-specific data" (non-close_polls reports).

## Data Flow

```
VxScan → QR code → phone camera → VxDesign URL
                                       ↓
                              processQrCodeReport()
                                       ↓
                        authenticateSignedQuickResultsReportingUrl()
                                       ↓
                        extractBallotHashFromPayload() → lookup election
                                       ↓
                        decodeQuickResultsMessage(payload, election)
                              ↓                    ↓
                        precinctIds[]         encodedCompressedTally
                              ↓                    ↓
                        store.saveQuickResultsReportingTally()
                              (precinct_ids = precinctIds.join(','))
```

## Two Query Paths

### getPollsStatusForElection

**Purpose:** Show which scanners have reported and their polls transition
status, grouped by precinct, on the Live Reports summary screen.

**Current behavior:** Fetches latest report per (machine_id, ballot_hash),
parses `precinct_ids`, and expands multi-precinct reports into individual
precinct buckets.

**Desired behavior (not yet implemented):** Should be simpler. Only cares
about the scanner's *configured* precinct selection, not the full list from
the bitmap:

- Single precinct ID in `precinct_ids` → bucket under that precinct
- Multiple or empty → bucket under `ALL_PRECINCTS_REPORT_KEY`
- No need to parse out individual precincts from multi-precinct reports

### getLiveReportTalliesForElection

**Purpose:** Aggregate contest results across all scanners for a given
precinct selection, shown on the tally report screen.

**Behavior:**

- **SinglePrecinct query:** Fetch rows where `precinct_ids` contains the
  requested precinct (SQL LIKE filter). For multi-precinct rows, use
  `splitEncodedTallyByPrecinct()` to extract just that precinct's V0 tally.
  For single-precinct rows, use directly.
- **AllPrecincts query:** Fetch all close_polls rows. Aggregate everything
  together via `combineAndDecodeCompressedElectionResults()`.

This is the method that actually needs per-precinct splitting logic.

## Response Types

`ReceivedReportInfoBase` has `precinctIds: PrecinctId[]` (decoded from bitmap).

`ReceivedPollsClosedFinalReportInfo` has
`contestResultsByPrecinct: Record<PrecinctId, Record<ContestId, ContestResults>>`
— the per-precinct contest results decoded from the tally.

`QuickReportedPollStatus` has `precinctIds: PrecinctId[]`.

## Open Design Questions for Polling Places

### Scanner Configuration vs Tally Content

There's a conceptual distinction between:

1. **What the VxScan is configured for** — single precinct, all precincts, or
   (future) a specific polling place
2. **What precincts have data in the tally** — determined by the bitmap

Currently these are conflated in `precinct_ids`. A scanner configured for "all
precincts" that only scanned ballots for precincts A and C will store
`precinct_ids = 'A,C'`. We can't distinguish this from a hypothetical
two-precinct polling place scanner.

When polling places are implemented, we may want to store the scanner's
configuration explicitly (e.g., `polling_place_id` or
`configured_precinct_selection`) separate from the tally's precinct data.

### How to Encode Scanner Configuration in QR

The precinct bitmap efficiently encodes *which precincts have data*. It does
NOT encode the scanner's configuration mode. Options for future:

1. **Add a separate field** for the scanner's configured precinct/polling
   place ID. This is the most explicit but adds bytes to the QR code.
2. **Infer from bitmap:** If bitmap has 1 precinct → single precinct scanner.
   If bitmap has multiple → all precincts scanner. This is ambiguous for
   edge cases (all-precincts scanner that only scanned one precinct's
   ballots).
3. **Encode polling place ID in the bitmap field** with a flag to distinguish
   it from a raw bitmap.

### getPollsStatusForElection Simplification

For polling places, this method should show scanner status by polling place,
not by individual precinct. The current multi-precinct expansion logic
(splitting comma-separated IDs into per-precinct buckets) should be removed.
Instead, the scanner's configured polling place/precinct should determine
which bucket it appears in.

### Storing Tally Data for Splitting

`splitEncodedTallyByPrecinct()` needs to know which precincts are in the
tally (and in what order) to correctly slice the uint16 entries. The precinct
order matches `election.precincts` order (bitmap bit indices). Currently this
info is stored as `precinct_ids` (comma-separated).

Alternative: store the encoded tally WITH the bitmap header combined (the old
`combineBitmapAndTallyEntries` approach that was removed). This makes the
stored tally self-describing — the bitmap can be read from the tally itself
at decode time. Trade-off is slightly more complex decode logic.

## Key Files

| File | Role |
|------|------|
| `libs/auth/src/signed_quick_results_reporting.ts` | QR message encoding/decoding, signature verification |
| `libs/utils/src/tabulation/compressed_tallies.ts` | Tally compression, bitmap encoding, per-precinct splitting |
| `apps/design/backend/src/app.ts` | `processQrCodeReport` — receives and processes QR reports |
| `apps/design/backend/src/store.ts` | DB save/query methods for results_reports |
| `apps/design/backend/src/types.ts` | `ReceivedReportInfo`, `QuickReportedPollStatus` types |
| `apps/design/frontend/src/live_reports_screen.tsx` | Summary + tally report UI |
| `apps/design/frontend/src/reporting_results_confirmation_screen.tsx` | QR scan confirmation UI (shows per-precinct tallies) |
| `apps/scan/backend/src/util/results.ts` | VxScan side — builds and encodes the QR payload |

## Branch Status

The `caro/lr_precinct_data` branch has the core per-precinct infrastructure
working but the test files are partially updated. The frontend test files
(`live_reports_screen.test.tsx`, `reporting_results_confirmation_screen.test.tsx`)
and backend test (`app.results.test.ts`) need mock data updated from
`precinctSelection` to `precinctIds` and `contestResults` to
`contestResultsByPrecinct`. The `getPollsStatusForElection` simplification
(stop expanding multi-precinct reports) has not been implemented yet.

# Straight-Party Voting POC

Branch: `jonah/straight-party-poc`

## Overview

This POC adds straight-party voting support to VxSuite, modeled on Michigan's
general election format. A "Straight Party Ticket" contest is automatically
injected into general elections for states that enable the feature (currently MI
only). When a voter fills the straight-party bubble for a party, their vote is
expanded to fill all partisan candidate contests with that party's candidates
(subject to deterministic expansion rules).

## Architecture

**Vote expansion happens at tally time, not scan time.** The raw ballot marks
are preserved as-is through the scanning pipeline. `applyStraightPartyRules()`
is called when reading CVRs for tabulation in both:

- VxScan results (`apps/scan/backend/src/util/results.ts`)
- VxAdmin CVR retrieval (`apps/admin/backend/src/store.ts:1557`)

**Contest injection** happens in VxDesign via `injectStraightPartyContest()`.
The straight-party contest is prepended to `election.contests` when:

1. State feature flag `STRAIGHT_PARTY_VOTING` is enabled (MI)
2. Election is general (not primary)
3. At least one candidate contest has candidates with `partyIds`

## Progress

### Done

- [x] VxDesign: contest injection, ballot rendering (MI template), contest list
      display, test deck generation, preview injection
- [x] Types: `StraightPartyContest`, `StraightPartyContestOption`,
      `StraightPartyContestResults`, CDF types
- [x] Core logic: `applyStraightPartyRules()` with comprehensive unit +
      integration tests
- [x] Ballot interpretation: straight-party marks handled in scoring pipeline
- [x] Adjudication: undervote/overvote/blank detection for straight-party
- [x] CVR building: `buildCVRStraightPartyContest()` for CDF export
- [x] CDF ballot definition: export/import support
- [x] Reports: contest results table renders straight-party results
- [x] CSV export: straight-party results included
- [x] VxAdmin: schema updated, `getFilteredContests` handles straight-party,
      type errors resolved
- [x] VxScan: type errors resolved, `applyStraightPartyRules` integrated
- [x] All type checks pass across codebase
- [x] All existing tests pass
- [x] Rust types-rs: `StraightPartyContest` variant in `Contest` enum
- [x] Fix `markToYesNoVotes` assertion to accept straight-party marks
- [x] Fix `groupContestsByParty` to include straight-party in non-partisan
      report section (was returning `false` for all groups)
- [x] Fix CVR option validation to skip straight-party contests (options
      derived from `election.parties`, not stored on contest)
- [x] Manual testing: VxDesign test decks, VxScan scanning, overvote
      adjudication, VxScan polls-closed report, VxAdmin CVR import, VxAdmin
      tally report — all passing

### Remaining

- [ ] Manual testing: undervote adjudication (Test 4), cross-party voting
      (Test 7), blank ballot (Test 9), full test deck round-trip (Test 10)
- [ ] `buildContestResultsFixture` straight-party support
      (`libs/utils/src/tabulation/tabulation.ts:890`)
- [ ] Automated test coverage for scanning/adjudication with straight-party
      fixtures
- [ ] Adjudication cascade behavior (straight-party + individual contest
      adjudication interaction)
- [ ] Manual tallies form — currently filtered out, decide if needed for POC
- [ ] VxMark BMD voting UI for straight-party contests

---

## Manual Testing Plan

VxDesign has been tested. The plan below covers VxAdmin and VxScan.

### Prerequisites

- Michigan general election created in VxDesign with straight-party enabled
- Election exported as election package (ZIP)

### Test 1: VxAdmin Election Setup

**Goal:** Verify VxAdmin correctly imports and displays an election with
straight-party.

1. Start VxAdmin, configure with the MI election package
2. Verify the election loads without errors
3. Check the contest list — "Straight Party Ticket" should appear
4. Navigate to any report/tally screen — straight-party contest should show up
   in the contest list

**Expected:** Election configures cleanly, straight-party contest visible
alongside other contests.

### Test 2: VxDesign Test Deck

**Goal:** Verify test deck generation includes straight-party ballots.

_Test decks are generated in VxDesign, not VxAdmin._

1. In VxDesign, generate a test deck for the MI election
2. Print or preview the test deck
3. Look for ballots with the "Straight Party Ticket" contest filled in
4. Verify: each party should get at least one test ballot with its bubble filled
5. Verify: the test deck tally should show expected results for straight-party
   (each party gets roughly equal votes)

**Expected:** Test deck includes straight-party ballots with rotating party
selections.

### Test 3: VxScan — Basic Straight-Party Scanning

**Goal:** Verify VxScan can scan a ballot with a straight-party mark.

1. Configure VxScan with the same MI election package
2. Print a test deck ballot that has a straight-party selection (e.g. Democratic)
3. Scan the ballot
4. Check the ballot review screen — the straight-party vote should be recorded
5. Accept the ballot

**Expected:** Ballot scans without errors. Straight-party mark is detected.

### Test 4: VxScan — Straight-Party Undervote Warning

**Goal:** Verify undervote detection works for straight-party.

1. Create/use a ballot where the straight-party contest is left blank (but other
   contests are filled)
2. Scan the ballot
3. Check if undervote adjudication is triggered for the straight-party contest
   (depends on adjudication settings)

**Expected:** If undervote adjudication is enabled, the straight-party undervote
should be flagged.

### Test 5: VxScan — Straight-Party Overvote

**Goal:** Verify overvote handling for straight-party.

1. Hand-mark a ballot with TWO party bubbles filled in the straight-party
   contest
2. Scan the ballot
3. Should trigger overvote adjudication

**Expected:** Ballot flagged for overvote in straight-party contest. If
adjudicated/accepted, the straight-party vote should NOT expand (overvoted
straight-party is ignored by expansion rules).

### Test 6: VxAdmin — CVR Import & Vote Expansion

**Goal:** Verify that straight-party votes are correctly expanded in VxAdmin
tallies.

1. From VxScan, export CVRs to USB
2. In VxAdmin, import the CVR file from USB
3. View the tally report
4. Check the **straight-party contest** results — should show vote counts per
   party
5. Check **individual partisan contests** — votes should be expanded per
   straight-party rules:
   - A ballot with "Democratic" straight-party and no individual marks should
     show Democratic candidates selected in all partisan contests
   - Non-partisan contests and ballot measures should be unaffected

**Expected:** Tally report shows both the raw straight-party contest results AND
the expanded votes in individual contests.

### Test 7: VxAdmin — Cross-Party Voting

**Goal:** Verify that cross-party selections override straight-party expansion.

1. Hand-mark a ballot:
   - Fill "Democratic" in straight-party contest
   - Fill a Republican candidate in one specific contest (e.g. U.S. Senator)
   - Leave all other contests blank
2. Scan on VxScan, export CVR, import to VxAdmin
3. Check the tally for that specific contest — the Republican candidate should
   be counted, NOT the Democrat
4. Check other partisan contests — Democrat candidates should be expanded

**Expected:** Voter's explicit cross-party choice preserved; straight-party
fills only the remaining unvoted contests.

### Test 8: VxAdmin — Reports

**Goal:** Verify tally reports render correctly with straight-party data.

1. With CVRs imported, generate a full election tally report
2. Verify:
   - Straight-party contest appears in the report with party-by-party tallies
   - Individual contest tallies reflect expanded votes
   - Overvotes/undervotes are counted correctly
3. Try filtering by precinct or ballot style — results should still be correct

**Expected:** Reports render cleanly, numbers add up, no crashes.

### Test 9: Blank Ballot

**Goal:** Verify blank ballot handling with straight-party present.

1. Scan a completely blank ballot (no marks anywhere)
2. Verify blank ballot adjudication triggers (if enabled)
3. If accepted, verify the straight-party contest shows as undervoted (not
   expanded)

**Expected:** Blank ballots are not expanded. Straight-party undervote recorded.

### Test 10: Full Test Deck Round-Trip

**Goal:** End-to-end L&A-style test.

1. In VxAdmin, generate and print the full test deck
2. Scan all test deck ballots through VxScan
3. Export CVRs, import to VxAdmin
4. Compare the VxAdmin tally report against the expected test deck tally
5. Verify all numbers match — including straight-party contest and expanded
   contest results

**Expected:** Test deck results match expected tallies. This is the most
important test — it validates the entire pipeline.

---

## Known Issues & Notes

- **Manual tallies:** Straight-party contests are filtered out of the manual
  tallies form (`apps/admin/frontend/.../manual_tallies_form_screen.tsx:437`).
  Manual entry of straight-party results is not supported. This may be
  acceptable for the POC — manual tallies could just record expanded votes
  directly in individual contests.
- **`buildContestResultsFixture`:** Asserts
  `contest.type !== 'straight-party'` — will need support if any test uses this
  helper with straight-party elections.
- **Compressed tallies:** Straight-party contests are filtered out of compressed
  tally encoding (`libs/utils/src/tabulation/compressed_tallies.ts`). This is
  intentional — compressed tallies are used for QR codes which have limited
  space.
- **BMD voting (VxMark):** The `bmd_votes_mock.ts` filters out straight-party
  contests. BMD straight-party voting UI is not implemented in this POC.

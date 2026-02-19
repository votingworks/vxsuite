# Straight Party Voting POC — Implementation Report

## Summary

All 14 planned commits were implemented plus 7 cherry-picked adjudication
commits. The core spec decisions held up well — Option A (new contest type) was
the right call, the derived/injected approach for VxDesign is clean, and the
pure-function expansion at tabulation chokepoints works exactly as designed.

After the initial POC (Plan A, branch `jonah/straight-party-poc`), four
improvements were implemented (Part A), and a synthetic districtId experiment was
done on a separate branch (Part B, branch
`jonah/straight-party-synthetic-district`). The findings below incorporate both.

## What Worked Well

**The spec nailed these:**

- **`applyStraightPartyRules` as a pure function.** Implemented exactly as
  specced. The algorithm is simple, testable, and the chokepoint integration at
  VxScan and VxAdmin was clean. 14 unit tests plus 6 integration tests all pass.
- **Derived contest (not stored).** `injectStraightPartyContest` is elegant —
  the contest materializes only at export/rendering boundaries. No database
  schema changes, no sync issues, deterministic.
- **State feature flag.** The `StateFeature.STRAIGHT_PARTY_VOTING` flag scoped
  to MI/DEMO was straightforward to implement in the existing features system.
- **No rotation.** Skipping ballot rotation for straight-party was trivial (same
  as yesno).
- **Grid layouts.** Using `PartyId` as option IDs worked without any changes to
  the grid layout or interpretation infrastructure, exactly as predicted.
- **Backward compatibility.** NH and MS templates simply `throw` on
  straight-party contests. No risk of silent failures.

## Part A: Improvements Applied

These improvements were implemented on the base POC branch:

### 1. Simplified `allContestOptions` to required-params signature

Collapsed 8 overloads (4 per function) down to a single signature with all
params required: `(contest, ballotStyle, parties)`. This eliminates the runtime
crash risk from missing `parties` — the original overloads accepted `parties?`
for the general case but crashed at runtime via `assertDefined` for
straight-party inputs.

**Spec update:** Document the required-params API. The overload mismatch was a
real defect — the adjudication store had shipped with a missing `parties`
argument.

### 2. CVR dual-snapshot export

Implemented `buildCVRStraightPartyContest` for the CVR CDF export. The
straight-party contest now appears in CVR snapshots. The `buildOriginalSnapshot`
function is mark-driven (maps over `BallotMark[]` without contest-type
awareness), so straight-party bubble marks will appear in the original snapshot
as long as the ballot interpreter emits them — which it does, since the grid
layout maps the bubbles correctly.

### 3. CDF ballot-definition `StraightPartyContest` export

The CDF ballot-definition schema does have a `StraightPartyContest` type. The
export builds proper `BallotDefinition.StraightPartyContest` objects with
`ControlledContestIds`, `ElectionDistrictId`, `Name`, and
`StraightPartyRuleset`.

**Important:** The CDF import (`convertCdfBallotDefinitionToVxfElection`)
currently filters out `StraightPartyContest` on import. This must change —
VxDesign exports CDF to VxAdmin, and VxAdmin needs to see the straight-party
contest. The import should convert `StraightPartyContest` back to the VxF type
rather than filtering it out. (VxDesign does not need to import
`StraightPartyContest` from CDF — it derives the contest internally.)

### 4. VxDesign read-only contest display

The straight-party contest now appears in VxDesign's contest list as read-only
(non-editable, non-deletable, non-reorderable). The `listContests` API injects
the contest at query time. The district filter has a special case
(`if (type === 'straight-party') return true`) since the synthetic district isn't
in the DB-backed district dropdown — this is acceptable.

## Part B: Synthetic `districtId` Experiment

Branch `jonah/straight-party-synthetic-district` adds `districtId: DistrictId`
to `StraightPartyContest` and creates a synthetic "election-wide" district in
`injectStraightPartyContest`. This is 2 commits ahead of the base POC (+75/-42,
14 files).

### What it changes

`injectStraightPartyContest` now also:
- Creates a synthetic district `{ id: 'election-wide', name: 'Election-wide' }`
- Adds it to `election.districts`
- Adds it to every ballot style's `districts` array
- Adds it to every precinct's `districtIds` (and split `districtIds`)

### Workarounds eliminated (7)

| Location | Plan A | Plan B |
|---|---|---|
| `getContests` | `if (type === 'straight-party') return true` | uniform district check |
| `buildBallotStyleContestIdsLookup` | `type === 'straight-party' \|\|` | uniform district check |
| `ballot_styles.ts` (x2) | `type === 'straight-party' \|\|` | uniform district check |
| `store.ts` insert | ternary null fallback | `contest.districtId` |
| `cdf_results.ts` | `countyId` parameter hack | `getDistrictIdFromContest` |
| `test_decks.ts` | redundant type guard | just `districtId === districtId` |

Plus 4 `DistrictContest` type predicates become simple filters (no functional
change, just cleaner).

### Remaining workarounds in Plan B (2)

1. **`contests_screen.tsx` district filter** — `if (type === 'straight-party')
   return true` because the synthetic district isn't in the DB-backed district
   dropdown.
2. **`contest_list.tsx` name display** — hardcodes `'Election-wide'` because the
   district isn't in the DB-backed name map.

Both are minor and isolated to VxDesign UI.

### Semantic special cases (unchanged in both plans, ~12)

These exist because straight-party has fundamentally different logic — they would
exist regardless of the districtId approach:
- BMD rendering excludes straight-party (different format)
- Compressed tallies exclude straight-party (format doesn't support it)
- CVR metadata excludes straight-party (CDF CVR format limitation)
- Ballot template layout renders straight-party separately
- Party grouping in reports excludes straight-party
- Various exhaustive switch/case dispatch arms

### Risks evaluated

| Risk | Assessment |
|---|---|
| **Election object in two states** (with/without synthetic district) | Non-issue in practice — `StraightPartyContest` only exists after injection, which always creates the district |
| **Synthetic district in CDF exports** | Acceptable — CDF requires *some* `GpUnit` for the contest; a dedicated 'election-wide' GpUnit is more honest than repurposing state or county |
| **Magic ID `'election-wide'` collision** | Non-issue — VxDesign auto-generates district IDs |
| **`hasMatchingDistrictIds` broken** | Found and fixed — `injectStraightPartyContest` now patches precincts too |
| **`generateBallotStyles` precinct filter** | Still needed (line 74) because `generateBallotStyles` runs before injection |

### Recommendation

**Adopt Plan B (synthetic districtId).** It eliminates the most impactful
workarounds — the ones in generic library utilities like `getContests` and
`buildBallotStyleContestIdsLookup` — while the remaining special cases are
minor, isolated, and semantic. The `DistrictContest` type becomes equivalent to
`Contest` and can be deprecated.

## Remaining TODOs

### For the spec

1. **CDF import must support `StraightPartyContest`** — the VxDesign → CDF →
   VxAdmin flow requires it. Don't filter out on import.
2. **`ContestLike` / `electionStrings.contestTitle()` incompatibility** —
   `ContestLike` requires `districtId`, which straight-party now has (Plan B),
   but the MI template uses `contest.title` directly. Decide whether to use the
   internationalization system for straight-party titles or keep the direct path
   (acceptable since multi-language is out of scope for initial release).
3. **Document report layout** — straight-party results have a slightly different
   visual layout than other contests (no district name display). Document the
   expected appearance.
4. **Adjudication cascade** — keep as-is in the POC for now. For initial
   release, consider a warning to adjudicators without automatic reset.

### For implementation

1. **`buildContestResultsFixture`** — needs a straight-party case for tabulation
   tests.
2. **VxDesign validation** — the spec says VxDesign must validate that no party
   has more candidates than seats in any candidate contest. Not yet implemented.
3. **Self-contained party options** — consider putting party options directly on
   `StraightPartyContest` at injection time to eliminate the `parties` param from
   `allContestOptions`. Would reduce coupling at 15 call sites.

## Conclusion

The POC validates that the spec's core architecture is sound. The pure-function
expansion, derived-contest injection, and new contest type approach all work
well. The synthetic districtId experiment (Plan B) is recommended — it
significantly reduces special-casing in generic utilities with minimal downside.
The main areas for spec revision are:

1. **Adopt synthetic districtId** (Plan B) as the default approach
2. **Fix CDF import** to support `StraightPartyContest` round-trip
3. **Consider self-contained party options** to simplify `allContestOptions`
4. **Add `buildContestResultsFixture` stub** and VxDesign validation

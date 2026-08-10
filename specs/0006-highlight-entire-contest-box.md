# Highlight Entire Contest Box in Adjudication

**Author:** @jonahkagan

**Status:** `planning`

## Existing Discussion

- [votingworks/vxsuite#8204](https://github.com/votingworks/vxsuite/issues/8204)
  — contest highlights don't include the header
- [votingworks/vxsuite#5650](https://github.com/votingworks/vxsuite/issues/5650)
  — contest highlights have wrong width on 2-column vs. 3-column ballots

## Problem

Contest bounds in the adjudication UI are inaccurate. They are derived from a
single set of option-size measurements applied uniformly to every option on the
ballot, but actual option and contest sizes vary. This causes two visible
issues:

1. **Missing headers** (#8204): The contest highlight doesn't include the
   contest header (title, vote instructions), so it cuts off the top of the
   contest box.
2. **Wrong dimensions** (#5650): On ballots with mixed column layouts (e.g. 2-
   and 3-column sections), contest highlights can have the wrong width. Option
   height variation (write-ins vs. candidates, text wrapping) also causes
   incorrect height.

These bounds are used in the adjudication UI for:

- **Ballot adjudication screen** — hovering over a contest in the sidebar
  highlights it on the ballot image
- **Contest adjudication screen** — the image viewer zooms to the contest bounds
- **Write-in adjudication** — when a user focuses on a write-in input, the image
  viewer zooms to that option's bounds to show the write-in area

Inaccurate bounds make it harder for adjudicators to orient themselves on the
ballot and can cut off relevant content. For write-in adjudication specifically,
wrong option bounds mean the zoom may not correctly frame the write-in area.

## Background

### How contest bounds are computed today

Contest bounds flow through a multi-stage pipeline:

1. **Measurement** (`libs/hmpb/src/render_ballot.tsx:361-427`): When rendering
   ballot templates, the code measures a single reference option element
   (preferring write-ins, which are largest) to compute
   `optionBoundsFromTargetMark` — an `Outset` (top/left/right/bottom) in timing
   mark grid units representing the distance from a bubble center to the option
   container edges.

2. **Storage in election** (`libs/types/src/election.ts:618-632`):
   `optionBoundsFromTargetMark` is stored as a single `Outset` on `GridLayout`,
   shared across all options and all contests for a ballot style.

3. **Ballot interpretation**
   (`libs/ballot-interpreter/src/bubble-ballot-rust/layout.rs:100-151`): For
   each option, the interpreter applies `optionBoundsFromTargetMark` to the
   bubble's grid position to get per-option pixel bounds. Contest bounds are
   then computed as the **union of all option bounds** within that contest.

4. **Adjudication** (`apps/admin/frontend/src/screens/`): Bounds are used in two
   ways:
   - **Contest bounds** (`BallotPageContestLayout.bounds`): used in
     `ballot_adjudication_screen.tsx` for hover highlights and in
     `contest_adjudication_screen.tsx` to zoom the image viewer to a contest.
   - **Option bounds** (`BallotPageContestOptionLayout.bounds`): used during
     write-in adjudication to zoom to a specific write-in area when the user
     focuses on a write-in input (`getOptionCoordinates()` in
     `utils/adjudication.ts`).

## Proposal

During ballot rendering, measure the actual bounding rects of contest containers
and individual option elements in grid coordinates, and store them in the
election definition. The Rust interpreter uses these directly instead of
deriving bounds from a single shared outset.

This fixes both problems:

- **Contest bounds** are measured from the actual contest container, which
  includes the header.
- **Option bounds** are measured per-option, so write-in areas, ballot measure
  text, and varying column widths are all captured accurately.

### Why grid coordinates instead of bubble-relative outsets

The current `optionBoundsFromTargetMark` uses an outset from a bubble center,
which made sense for a single shared measurement. For per-element bounds, grid
coordinate rects are more straightforward.

### Data model changes

Since we are moving to v4.1, we can make breaking changes to the election
definition. This proposal moves the contents of `gridLayouts` into each ballot
style and restructures it to use hierarchical structures to match the ballot's
structure (sheets -> contests -> options).

```typescript
// libs/types/src/election.ts

type GridUnit = number;

interface GridPoint {
  readonly row: GridUnit;
  readonly column: GridUnit;
}

interface GridRect {
  readonly row: GridUnit;
  readonly column: GridUnit;
  readonly width: GridUnit;
  readonly height: GridUnit;
}

interface OptionPosition {
  readonly type: 'option';
  readonly bubbleCenter: GridPoint;
  readonly bounds: GridRect;
  readonly optionId: Id;
  readonly partyIds?: readonly PartyId[];
}

interface WriteInPosition {
  readonly type: 'write-in';
  readonly bubbleCenter: GridPoint;
  readonly bounds: GridRect;
  readonly writeInIndex: number;
  readonly writeInArea: GridRect;
}

type ContestOptionPosition = OptionPosition | WriteInPosition;

interface ContestPosition {
  readonly contestId: ContestId;
  readonly bounds: GridRect;
  readonly options: readonly ContestOptionPosition[];
}

type SheetPositions = SheetOf<ContestPosition[]>;

interface BallotStyle {
  // ... existing fields (id, groupId, precincts, districts, partyId, etc.) ...
  readonly ballotPositions: readonly SheetPositions[];
}
```

Note that I stuck with the "position" terminology to distinguish these from the
existing "layout" types, which are used to describe the computed layouts after
interpretation (even though "layout" feels a bit more fitting).

### Compatibility considerations

Some customers may still be running 4.0 through fall elections. VxDesign
currently has no mechanism for exporting multiple election definition formats.

A few options for handling this:

1. Add a version flag to each jurisdiction in VxDesign. Export the appropriate
   election definition format based on the flag.
2. Keep exporting both `gridLayouts` and the new `BallotStyle.ballotPositions`
   field for now, so every election is compatible with both 4.0 and 4.1.
3. Add the new contest bounds and option bounds as optional fields on the
   existing `GridLayout`, so every election is compatible with both 4.0 and 4.1.

Option 1 would set us up with a model for making breaking changes in the future
and would give us an explicit way to track when we can remove the code that
supports deprecated versions. However, it does add some complication to
VxDesign.

Option 2 is pretty easy to implement, but does inflate the election definition
and make it a little less clear (though human-readability of the JSON isn't that
important).

Option 3 feels like it would just add tech debt, so I'm not inclined to do it,
though it is the most minimal change.

Looking for feedback on these options.

## Alternatives Considered

Discussed in context above

## Open Questions

Discussed in context above

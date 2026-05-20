import { expect, test } from 'vitest';
import { assertDefined } from '@votingworks/basics';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import { electionOpenPrimaryFixtures } from '@votingworks/fixtures';
import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  BallotType,
  HmpbBallotPageMetadata,
  InterpretedBmdPage,
  InterpretedHmpbPage,
  PageInterpretation,
  SheetInterpretation,
  VotesDict,
} from '@votingworks/types';
import { combinePageInterpretationsForSheet } from './combine_page_interpretations_for_sheet';

const { election, electionDefinition } = vxFamousNamesFixtures;
const openPrimaryElection = electionOpenPrimaryFixtures.readElection();

const firstBallotStyle = assertDefined(election.ballotStyles[0]);
const invalidPageMetadata: HmpbBallotPageMetadata = {
  ballotStyleId: firstBallotStyle.id,
  precinctId: assertDefined(firstBallotStyle.precincts[0]),
  ballotType: BallotType.Precinct,
  ballotHash: electionDefinition.ballotHash,
  isTestMode: false,
  pageNumber: 1,
};

function mockHmpbPage({
  numMarks = 1,
  requiresAdjudication = false,
  enabledReasonInfos = [],
  votes = {},
}: {
  numMarks?: number;
  requiresAdjudication?: boolean;
  enabledReasonInfos?: AdjudicationReasonInfo[];
  votes?: VotesDict;
} = {}): InterpretedHmpbPage {
  // Just mock the fields needed for combinePageInterpretationsForSheet
  // (bypassing the type system)
  return {
    type: 'InterpretedHmpbPage',
    markInfo: { marks: Array.from({ length: numMarks }, () => ({})) },
    votes,
    adjudicationInfo: {
      requiresAdjudication,
      enabledReasons: [],
      enabledReasonInfos,
      ignoredReasonInfos: [],
    },
  } as unknown as InterpretedHmpbPage;
}

function mockBmdPage({
  requiresAdjudication = false,
  enabledReasonInfos = [],
}: {
  requiresAdjudication?: boolean;
  enabledReasonInfos?: AdjudicationReasonInfo[];
} = {}): InterpretedBmdPage {
  // Just mock the fields needed for combinePageInterpretationsForSheet
  // (bypassing the type system)
  return {
    type: 'InterpretedBmdPage',
    adjudicationInfo: {
      requiresAdjudication,
      enabledReasons: [],
      enabledReasonInfos,
      ignoredReasonInfos: [],
    },
  } as unknown as InterpretedBmdPage;
}

const blankPage: PageInterpretation = { type: 'BlankPage' };

test('treats BMD ballot with one blank side as valid', () => {
  const printed = mockBmdPage();
  expect(
    combinePageInterpretationsForSheet([printed, blankPage], election)
  ).toEqual<SheetInterpretation>({
    type: 'ValidSheet',
  });
  expect(
    combinePageInterpretationsForSheet([blankPage, printed], election)
  ).toEqual<SheetInterpretation>({
    type: 'ValidSheet',
  });
});

test('respects adjudication reasons for a BMD ballot', () => {
  const reasons: AdjudicationReasonInfo[] = [
    {
      type: AdjudicationReason.Undervote,
      contestId: 'contest-1',
      expected: 1,
      optionIds: [],
    },
  ];
  const printed = mockBmdPage({
    requiresAdjudication: true,
    enabledReasonInfos: reasons,
  });
  expect(
    combinePageInterpretationsForSheet([printed, blankPage], election)
  ).toEqual<SheetInterpretation>({
    type: 'NeedsReviewSheet',
    reasons,
  });
});

const blankBallotReason: AdjudicationReasonInfo = {
  type: AdjudicationReason.BlankBallot,
};

test('flags BlankBallot when both sides have bubbles and BlankBallot reason fires on both', () => {
  const front = mockHmpbPage({
    requiresAdjudication: true,
    enabledReasonInfos: [blankBallotReason],
  });
  const back = mockHmpbPage({
    requiresAdjudication: true,
    enabledReasonInfos: [blankBallotReason],
  });
  expect(
    combinePageInterpretationsForSheet([front, back], election)
  ).toEqual<SheetInterpretation>({
    type: 'NeedsReviewSheet',
    reasons: [blankBallotReason],
  });
});

test('flags BlankBallot when one side has bubbles unmarked and the other side has no bubbles', () => {
  // Realistic for a multi-page HMPB whose back has no contests; the empty
  // side has no scored reasons, so the combiner falls back to marks.length.
  const bubbledSide = mockHmpbPage({
    requiresAdjudication: true,
    enabledReasonInfos: [blankBallotReason],
  });
  const emptySide = mockHmpbPage({ numMarks: 0 });
  expect(
    combinePageInterpretationsForSheet([bubbledSide, emptySide], election)
  ).toEqual<SheetInterpretation>({
    type: 'NeedsReviewSheet',
    reasons: [blankBallotReason],
  });
  expect(
    combinePageInterpretationsForSheet([emptySide, bubbledSide], election)
  ).toEqual<SheetInterpretation>({
    type: 'NeedsReviewSheet',
    reasons: [blankBallotReason],
  });
});

test('returns ValidSheet when both sides have bubbles unmarked but BlankBallot is not enabled', () => {
  // BlankBallot adjudication is off → no BlankBallot reason fires →
  // combiner respects the config and doesn't flag.
  const front = mockHmpbPage();
  const back = mockHmpbPage();
  expect(
    combinePageInterpretationsForSheet([front, back], election)
  ).toEqual<SheetInterpretation>({ type: 'ValidSheet' });
});

test('returns ValidSheet when both sides have no bubbles', () => {
  const front = mockHmpbPage({ numMarks: 0 });
  const back = mockHmpbPage({ numMarks: 0 });
  expect(
    combinePageInterpretationsForSheet([front, back], election)
  ).toEqual<SheetInterpretation>({ type: 'ValidSheet' });
});

test('drops blank reason from one side when other side has non-blank reasons', () => {
  const overvoteReason: AdjudicationReasonInfo = {
    type: AdjudicationReason.Overvote,
    contestId: 'contest-1',
    expected: 1,
    optionIds: ['a', 'b'],
  };
  const front = mockHmpbPage({
    numMarks: 0,
    requiresAdjudication: true,
    enabledReasonInfos: [{ type: AdjudicationReason.BlankBallot }],
  });
  const back = mockHmpbPage({
    requiresAdjudication: true,
    enabledReasonInfos: [overvoteReason],
  });
  expect(
    combinePageInterpretationsForSheet([front, back], election)
  ).toEqual<SheetInterpretation>({
    type: 'NeedsReviewSheet',
    reasons: [overvoteReason],
  });
});

test('treats either page being an invalid ballot hash as an invalid sheet', () => {
  const invalidBallotHashPage: PageInterpretation = {
    type: 'InvalidBallotHashPage',
    expectedBallotHash: 'expected',
    actualBallotHash: 'actual',
  };
  expect(
    combinePageInterpretationsForSheet(
      [invalidBallotHashPage, { type: 'UnreadablePage' }],
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: { type: 'invalid_ballot_hash', actualBallotHash: 'actual' },
  });
  expect(
    combinePageInterpretationsForSheet(
      [{ type: 'UnreadablePage' }, invalidBallotHashPage],
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: { type: 'invalid_ballot_hash', actualBallotHash: 'actual' },
  });
});

test('treats either page being an invalid test mode as an invalid sheet', () => {
  const invalidTestModePage: PageInterpretation = {
    type: 'InvalidTestModePage',
    metadata: invalidPageMetadata,
  };
  expect(
    combinePageInterpretationsForSheet(
      [invalidTestModePage, { type: 'UnreadablePage' }],
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: { type: 'invalid_test_mode' },
  });
  expect(
    combinePageInterpretationsForSheet(
      [{ type: 'UnreadablePage' }, invalidTestModePage],
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: { type: 'invalid_test_mode' },
  });
});

test('treats either page being an invalid precinct as an invalid sheet', () => {
  const invalidPrecinctPage: PageInterpretation = {
    type: 'InvalidPrecinctPage',
    metadata: invalidPageMetadata,
  };
  expect(
    combinePageInterpretationsForSheet(
      [invalidPrecinctPage, { type: 'UnreadablePage' }],
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: { type: 'invalid_precinct' },
  });
  expect(
    combinePageInterpretationsForSheet(
      [{ type: 'UnreadablePage' }, invalidPrecinctPage],
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: { type: 'invalid_precinct' },
  });
});

test('treats either page having invalid scale as an invalid sheet', () => {
  const invalidScalePage: PageInterpretation = {
    type: 'UnreadablePage',
    reason: 'invalidScale',
  };
  expect(
    combinePageInterpretationsForSheet(
      [invalidScalePage, { type: 'UnreadablePage' }],
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: { type: 'invalid_scale' },
  });
  expect(
    combinePageInterpretationsForSheet(
      [{ type: 'UnreadablePage' }, invalidScalePage],
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: { type: 'invalid_scale' },
  });
});

test('treats either page having BMD ballot scanning disabled as an invalid sheet', () => {
  const bmdDisabledPage: PageInterpretation = {
    type: 'UnreadablePage',
    reason: 'bmdBallotScanningDisabled',
  };
  expect(
    combinePageInterpretationsForSheet(
      [bmdDisabledPage, { type: 'UnreadablePage' }],
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: { type: 'bmd_ballot_scanning_disabled' },
  });
  expect(
    combinePageInterpretationsForSheet(
      [{ type: 'UnreadablePage' }, bmdDisabledPage],
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: { type: 'bmd_ballot_scanning_disabled' },
  });
});

test('treats either page having vertical streaks as an invalid sheet', () => {
  const verticalStreaksPage: PageInterpretation = {
    type: 'UnreadablePage',
    reason: 'verticalStreaksDetected',
  };
  expect(
    combinePageInterpretationsForSheet(
      [verticalStreaksPage, { type: 'UnreadablePage' }],
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: { type: 'vertical_streaks_detected' },
  });
  expect(
    combinePageInterpretationsForSheet(
      [{ type: 'UnreadablePage' }, verticalStreaksPage],
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: { type: 'vertical_streaks_detected' },
  });
});

test('treats unreadable pages as an invalid sheet', () => {
  expect(
    combinePageInterpretationsForSheet(
      [{ type: 'UnreadablePage' }, { type: 'UnreadablePage' }],
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: { type: 'unreadable' },
  });
});

test('treats unmatched page combinations as unknown invalid sheet', () => {
  // Both blank doesn't match any specific case.
  expect(
    combinePageInterpretationsForSheet([blankPage, blankPage], election)
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: { type: 'unknown' },
  });
});

test('flags crossover voting in open primaries', () => {
  const front = mockHmpbPage({
    votes: {
      'governor-democratic': [
        { id: 'alice-jones', name: 'Alice Jones', partyIds: undefined },
      ],
    },
  });
  const back = mockHmpbPage({
    votes: {
      'governor-republican': [
        { id: 'dave-wilson', name: 'Dave Wilson', partyIds: undefined },
      ],
    },
  });
  expect(
    combinePageInterpretationsForSheet([front, back], openPrimaryElection)
  ).toEqual<SheetInterpretation>({
    type: 'NeedsReviewSheet',
    reasons: [{ type: AdjudicationReason.CrossoverVoting }],
  });
});

test('combines crossover voting with other adjudication reasons', () => {
  const overvoteReason: AdjudicationReasonInfo = {
    type: AdjudicationReason.Overvote,
    contestId: 'governor-democratic',
    expected: 1,
    optionIds: ['alice-jones', 'jane-smith'],
  };
  const front = mockHmpbPage({
    requiresAdjudication: true,
    enabledReasonInfos: [overvoteReason],
    votes: {
      'governor-democratic': [
        { id: 'alice-jones', name: 'Alice Jones', partyIds: undefined },
        { id: 'jane-smith', name: 'Jane Smith', partyIds: undefined },
      ],
    },
  });
  const back = mockHmpbPage({
    votes: {
      'governor-republican': [
        { id: 'dave-wilson', name: 'Dave Wilson', partyIds: undefined },
      ],
    },
  });
  expect(
    combinePageInterpretationsForSheet([front, back], openPrimaryElection)
  ).toEqual<SheetInterpretation>({
    type: 'NeedsReviewSheet',
    reasons: [overvoteReason, { type: AdjudicationReason.CrossoverVoting }],
  });
});

test('treats single-party open primary voting as valid', () => {
  const front = mockHmpbPage({
    votes: {
      'governor-democratic': [
        { id: 'alice-jones', name: 'Alice Jones', partyIds: undefined },
      ],
    },
  });
  const back = mockHmpbPage({
    votes: {
      'secretary-of-state-democratic': [
        { id: 'james-martin', name: 'James Martin', partyIds: undefined },
      ],
    },
  });
  expect(
    combinePageInterpretationsForSheet([front, back], openPrimaryElection)
  ).toEqual<SheetInterpretation>({
    type: 'ValidSheet',
  });
});

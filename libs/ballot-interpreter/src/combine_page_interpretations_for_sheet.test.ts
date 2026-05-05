import { expect, test } from 'vitest';
import { assertDefined } from '@votingworks/basics';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import { electionOpenPrimaryFixtures } from '@votingworks/fixtures';
import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  BallotType,
  HmpbBallotPageMetadata,
  InterpretedBmdMultiPagePage,
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

function mockBmdMultiPagePage({
  requiresAdjudication = false,
  enabledReasonInfos = [],
}: {
  requiresAdjudication?: boolean;
  enabledReasonInfos?: AdjudicationReasonInfo[];
} = {}): InterpretedBmdMultiPagePage {
  // Just mock the fields needed for combinePageInterpretationsForSheet
  // (bypassing the type system)
  return {
    type: 'InterpretedBmdMultiPagePage',
    adjudicationInfo: {
      requiresAdjudication,
      enabledReasons: [],
      enabledReasonInfos,
      ignoredReasonInfos: [],
    },
  } as unknown as InterpretedBmdMultiPagePage;
}

const blankPage: PageInterpretation = { type: 'BlankPage' };

function mockSheet(
  front: PageInterpretation,
  back: PageInterpretation
): Parameters<typeof combinePageInterpretationsForSheet>[0] {
  return [
    { imagePath: 'front.jpeg', interpretation: front },
    { imagePath: 'back.jpeg', interpretation: back },
  ];
}

test('treats BMD ballot with one blank side as valid', () => {
  const printed = mockBmdPage();
  expect(
    combinePageInterpretationsForSheet(mockSheet(printed, blankPage), election)
  ).toEqual<SheetInterpretation>({
    type: 'ValidSheet',
  });
  expect(
    combinePageInterpretationsForSheet(mockSheet(blankPage, printed), election)
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
    combinePageInterpretationsForSheet(mockSheet(printed, blankPage), election)
  ).toEqual<SheetInterpretation>({
    type: 'NeedsReviewSheet',
    reasons,
  });
});

test('treats multi-page BMD ballot with one blank side as valid', () => {
  const printed = mockBmdMultiPagePage();
  expect(
    combinePageInterpretationsForSheet(mockSheet(printed, blankPage), election)
  ).toEqual<SheetInterpretation>({
    type: 'ValidSheet',
  });
  expect(
    combinePageInterpretationsForSheet(mockSheet(blankPage, printed), election)
  ).toEqual<SheetInterpretation>({
    type: 'ValidSheet',
  });
});

test('respects adjudication reasons for a multi-page BMD ballot', () => {
  const reasons: AdjudicationReasonInfo[] = [
    {
      type: AdjudicationReason.Undervote,
      contestId: 'contest-1',
      expected: 1,
      optionIds: [],
    },
  ];
  const printed = mockBmdMultiPagePage({
    requiresAdjudication: true,
    enabledReasonInfos: reasons,
  });
  expect(
    combinePageInterpretationsForSheet(mockSheet(printed, blankPage), election)
  ).toEqual<SheetInterpretation>({
    type: 'NeedsReviewSheet',
    reasons,
  });
});

test('treats HMPB ballot with both sides marked blank as a blank ballot', () => {
  const blankReason: AdjudicationReasonInfo = {
    type: AdjudicationReason.BlankBallot,
  };
  const front = mockHmpbPage({
    requiresAdjudication: true,
    enabledReasonInfos: [blankReason],
  });
  const back = mockHmpbPage({
    requiresAdjudication: true,
    enabledReasonInfos: [blankReason],
  });
  expect(
    combinePageInterpretationsForSheet(mockSheet(front, back), election)
  ).toEqual<SheetInterpretation>({
    type: 'NeedsReviewSheet',
    reasons: [{ type: AdjudicationReason.BlankBallot }],
  });
});

test('treats HMPB ballot with no marks on either side as a blank ballot', () => {
  const front = mockHmpbPage({ numMarks: 0, requiresAdjudication: true });
  const back = mockHmpbPage({ numMarks: 0, requiresAdjudication: true });
  expect(
    combinePageInterpretationsForSheet(mockSheet(front, back), election)
  ).toEqual<SheetInterpretation>({
    type: 'NeedsReviewSheet',
    reasons: [{ type: AdjudicationReason.BlankBallot }],
  });
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
    combinePageInterpretationsForSheet(mockSheet(front, back), election)
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
      mockSheet(invalidBallotHashPage, { type: 'UnreadablePage' }),
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'invalid_ballot_hash',
  });
  expect(
    combinePageInterpretationsForSheet(
      mockSheet({ type: 'UnreadablePage' }, invalidBallotHashPage),
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'invalid_ballot_hash',
  });
});

test('treats either page being an invalid test mode as an invalid sheet', () => {
  const invalidTestModePage: PageInterpretation = {
    type: 'InvalidTestModePage',
    metadata: invalidPageMetadata,
  };
  expect(
    combinePageInterpretationsForSheet(
      mockSheet(invalidTestModePage, { type: 'UnreadablePage' }),
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'invalid_test_mode',
  });
  expect(
    combinePageInterpretationsForSheet(
      mockSheet({ type: 'UnreadablePage' }, invalidTestModePage),
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'invalid_test_mode',
  });
});

test('treats either page being an invalid precinct as an invalid sheet', () => {
  const invalidPrecinctPage: PageInterpretation = {
    type: 'InvalidPrecinctPage',
    metadata: invalidPageMetadata,
  };
  expect(
    combinePageInterpretationsForSheet(
      mockSheet(invalidPrecinctPage, { type: 'UnreadablePage' }),
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'invalid_precinct',
  });
  expect(
    combinePageInterpretationsForSheet(
      mockSheet({ type: 'UnreadablePage' }, invalidPrecinctPage),
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'invalid_precinct',
  });
});

test('treats either page having invalid scale as an invalid sheet', () => {
  const invalidScalePage: PageInterpretation = {
    type: 'UnreadablePage',
    reason: 'invalidScale',
  };
  expect(
    combinePageInterpretationsForSheet(
      mockSheet(invalidScalePage, { type: 'UnreadablePage' }),
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'invalid_scale',
  });
  expect(
    combinePageInterpretationsForSheet(
      mockSheet({ type: 'UnreadablePage' }, invalidScalePage),
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'invalid_scale',
  });
});

test('treats either page having BMD ballot scanning disabled as an invalid sheet', () => {
  const bmdDisabledPage: PageInterpretation = {
    type: 'UnreadablePage',
    reason: 'bmdBallotScanningDisabled',
  };
  expect(
    combinePageInterpretationsForSheet(
      mockSheet(bmdDisabledPage, { type: 'UnreadablePage' }),
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'bmd_ballot_scanning_disabled',
  });
  expect(
    combinePageInterpretationsForSheet(
      mockSheet({ type: 'UnreadablePage' }, bmdDisabledPage),
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'bmd_ballot_scanning_disabled',
  });
});

test('treats either page having vertical streaks as an invalid sheet', () => {
  const verticalStreaksPage: PageInterpretation = {
    type: 'UnreadablePage',
    reason: 'verticalStreaksDetected',
  };
  expect(
    combinePageInterpretationsForSheet(
      mockSheet(verticalStreaksPage, { type: 'UnreadablePage' }),
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'vertical_streaks_detected',
  });
  expect(
    combinePageInterpretationsForSheet(
      mockSheet({ type: 'UnreadablePage' }, verticalStreaksPage),
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'vertical_streaks_detected',
  });
});

test('treats unreadable pages as an invalid sheet', () => {
  expect(
    combinePageInterpretationsForSheet(
      mockSheet({ type: 'UnreadablePage' }, { type: 'UnreadablePage' }),
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'unreadable',
  });
});

test('treats unmatched page combinations as unknown invalid sheet', () => {
  // Both blank doesn't match any specific case.
  expect(
    combinePageInterpretationsForSheet(
      mockSheet(blankPage, blankPage),
      election
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'unknown',
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
    combinePageInterpretationsForSheet(
      mockSheet(front, back),
      openPrimaryElection
    )
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
    combinePageInterpretationsForSheet(
      mockSheet(front, back),
      openPrimaryElection
    )
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
    combinePageInterpretationsForSheet(
      mockSheet(front, back),
      openPrimaryElection
    )
  ).toEqual<SheetInterpretation>({
    type: 'ValidSheet',
  });
});

import { describe, expect, test } from 'vitest';
import { throwIllegalValue } from '@votingworks/basics';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  BallotId,
  BallotMetadata,
  BallotStyleId,
  BallotType,
  BlankPage,
  InterpretedBmdMultiPagePage,
  InterpretedBmdPage,
  InterpretedHmpbPage,
  InvalidBallotHashPage,
  InvalidPrecinctPage,
  InvalidTestModePage,
  PageInterpretation,
  UnreadablePage,
} from '@votingworks/types';
import { sheetRequiresAdjudication } from './sheet_requires_adjudication';

const metadata: BallotMetadata = {
  ballotStyleId: '12' as BallotStyleId,
  ballotType: BallotType.Precinct,
  ballotHash:
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition()
      .ballotHash,
  isTestMode: false,
  precinctId: '23',
};
const pageInterpretationBoilerplate: InterpretedHmpbPage = {
  type: 'InterpretedHmpbPage',
  metadata: {
    ...metadata,
    pageNumber: 3,
  },
  markInfo: {
    ballotSize: {
      height: 1584,
      width: 1224,
    },
    marks: [
      {
        type: 'candidate',
        bounds: {
          height: 20,
          width: 31,
          x: 451,
          y: 645,
        },
        contestId: 'contest-id',
        target: {
          bounds: {
            height: 20,
            width: 31,
            x: 451,
            y: 645,
          },
          inner: {
            height: 16,
            width: 27,
            x: 453,
            y: 647,
          },
        },
        optionId: '42',
        score: 0.8,
        scoredOffset: { x: 0, y: 0 },
      },
    ],
  },
  votes: {},
  adjudicationInfo: {
    ignoredReasonInfos: [],
    enabledReasonInfos: [],
    enabledReasons: [],
    requiresAdjudication: false,
  },
  layout: {
    pageSize: { width: 0, height: 0 },
    metadata: {
      ...metadata,
      pageNumber: 3,
    },
    contests: [],
  },
};

function withPageNumber(
  page: PageInterpretation,
  pageNumber: number
): PageInterpretation {
  switch (page.type) {
    case 'BlankPage':
    case 'InterpretedBmdPage':
    case 'InterpretedBmdMultiPagePage':
    case 'InvalidBallotHashPage':
    case 'UnreadablePage':
      return page;

    case 'InterpretedHmpbPage':
      return { ...page, metadata: { ...page.metadata, pageNumber } };

    case 'InvalidPrecinctPage':
    case 'InvalidTestModePage':
      if ('pageNumber' in page.metadata) {
        return { ...page, metadata: { ...page.metadata, pageNumber } };
      }
      return page;

    default:
      throwIllegalValue(page, 'type');
  }
}

test('sheetRequiresAdjudication triggers if front or back requires adjudication', () => {
  const sideYes: InterpretedHmpbPage = {
    ...pageInterpretationBoilerplate,
    adjudicationInfo: {
      ...pageInterpretationBoilerplate.adjudicationInfo,
      enabledReasonInfos: [
        {
          type: AdjudicationReason.Overvote,
          contestId: '42',
          optionIds: ['27', '28'],
          expected: 1,
        },
      ],
      ignoredReasonInfos: [],
      requiresAdjudication: true,
    },
  };

  const sideNo: InterpretedHmpbPage = {
    ...pageInterpretationBoilerplate,
    adjudicationInfo: {
      ...pageInterpretationBoilerplate.adjudicationInfo,
      requiresAdjudication: false,
    },
  };

  expect(
    sheetRequiresAdjudication([
      withPageNumber(sideYes, 1),
      withPageNumber(sideNo, 2),
    ])
  ).toEqual(true);
  expect(
    sheetRequiresAdjudication([
      withPageNumber(sideNo, 1),
      withPageNumber(sideYes, 2),
    ])
  ).toEqual(true);
  expect(
    sheetRequiresAdjudication([
      withPageNumber(sideYes, 1),
      withPageNumber(sideYes, 2),
    ])
  ).toEqual(true);
  expect(
    sheetRequiresAdjudication([
      withPageNumber(sideNo, 1),
      withPageNumber(sideNo, 2),
    ])
  ).toEqual(false);
});

const hmpbWithVotes: InterpretedHmpbPage = {
  ...pageInterpretationBoilerplate,
  adjudicationInfo: {
    requiresAdjudication: false,
    enabledReasons: [],
    enabledReasonInfos: [],
    ignoredReasonInfos: [],
  },
};

const hmpbNoVotes: InterpretedHmpbPage = {
  ...pageInterpretationBoilerplate,
  adjudicationInfo: {
    requiresAdjudication: true,
    enabledReasons: [AdjudicationReason.BlankBallot],
    enabledReasonInfos: [{ type: AdjudicationReason.BlankBallot }],
    ignoredReasonInfos: [],
  },
};

test('sheetRequiresAdjudication triggers for HMPB/blank page', () => {
  const blank: BlankPage = {
    type: 'BlankPage',
  };

  expect(sheetRequiresAdjudication([hmpbNoVotes, hmpbNoVotes])).toEqual(true);
  expect(
    sheetRequiresAdjudication([
      withPageNumber(hmpbNoVotes, 1),
      withPageNumber(hmpbWithVotes, 2),
    ])
  ).toEqual(false);
  expect(
    sheetRequiresAdjudication([
      withPageNumber(hmpbWithVotes, 1),
      withPageNumber(hmpbWithVotes, 2),
    ])
  ).toEqual(false);

  expect(sheetRequiresAdjudication([hmpbNoVotes, blank])).toEqual(true);
  expect(sheetRequiresAdjudication([blank, hmpbNoVotes])).toEqual(true);

  expect(sheetRequiresAdjudication([hmpbWithVotes, blank])).toEqual(true);
  expect(sheetRequiresAdjudication([blank, hmpbWithVotes])).toEqual(true);

  expect(sheetRequiresAdjudication([blank, blank])).toEqual(true);
});

test('sheetRequiresAdjudication is happy with a BMD ballot', () => {
  const bmd: InterpretedBmdPage = {
    type: 'InterpretedBmdPage',
    metadata: {
      ballotHash: '41',
      precinctId: '12',
      ballotStyleId: '1' as BallotStyleId,
      isTestMode: true,
      ballotType: BallotType.Precinct,
    },
    adjudicationInfo: {
      requiresAdjudication: false,
      ignoredReasonInfos: [],
      enabledReasonInfos: [],
      enabledReasons: [],
    },
    votes: {},
  };

  const unreadable: UnreadablePage = {
    type: 'UnreadablePage',
    reason:
      'cause there were a few too many black pixels so it was not filtered',
  };

  const blank: BlankPage = {
    type: 'BlankPage',
  };

  expect(sheetRequiresAdjudication([bmd, unreadable])).toEqual(false);
  expect(sheetRequiresAdjudication([unreadable, bmd])).toEqual(false);
  expect(sheetRequiresAdjudication([bmd, blank])).toEqual(false);
  expect(sheetRequiresAdjudication([blank, bmd])).toEqual(false);
});

test('sheetRequiresAdjudication catches single-sided blank ballots if undervote adjudication is on', () => {
  const hmpbNoVotesUndervotesFlagged: InterpretedHmpbPage = {
    ...pageInterpretationBoilerplate,
    adjudicationInfo: {
      requiresAdjudication: true,
      enabledReasons: [
        AdjudicationReason.BlankBallot,
        AdjudicationReason.Undervote,
      ],
      enabledReasonInfos: [
        { type: AdjudicationReason.BlankBallot },
        {
          type: AdjudicationReason.Undervote,
          contestId: '42',
          optionIds: ['27', '28'],
          expected: 1,
        },
      ],
      ignoredReasonInfos: [],
    },
  };

  expect(sheetRequiresAdjudication([hmpbWithVotes, hmpbNoVotes])).toEqual(
    false
  );
  expect(
    sheetRequiresAdjudication([hmpbWithVotes, hmpbNoVotesUndervotesFlagged])
  ).toEqual(true);
});

// ---------------------------------------------------------------------------
// Exhaustive characterization (gap coverage on top of the tests above).
// These tests pin every observable branch so the upcoming refactor — which
// replaces this function with combinePageInterpretationsForSheet from
// libs/ballot-interpreter — can prove behavior preservation case by case.
// ---------------------------------------------------------------------------

function hmpbWithReasons(
  reasons: readonly AdjudicationReasonInfo[],
  options: { marks?: 'has-marks' | 'zero-marks' } = {}
): InterpretedHmpbPage {
  const hasMarks = (options.marks ?? 'has-marks') === 'has-marks';
  return {
    ...pageInterpretationBoilerplate,
    markInfo: {
      ...pageInterpretationBoilerplate.markInfo,
      marks: hasMarks ? pageInterpretationBoilerplate.markInfo.marks : [],
    },
    adjudicationInfo: {
      enabledReasons: reasons.map((r) => r.type),
      enabledReasonInfos: reasons,
      ignoredReasonInfos: [],
      requiresAdjudication: reasons.length > 0,
    },
  };
}

const overvoteReason: AdjudicationReasonInfo = {
  type: AdjudicationReason.Overvote,
  contestId: '42',
  optionIds: ['27', '28'],
  expected: 1,
};
const undervoteReason: AdjudicationReasonInfo = {
  type: AdjudicationReason.Undervote,
  contestId: '42',
  optionIds: ['27'],
  expected: 1,
};
const marginalMarkReason: AdjudicationReasonInfo = {
  type: AdjudicationReason.MarginalMark,
  contestId: '42',
  optionId: '42',
};
const blankBallotReason: AdjudicationReasonInfo = {
  type: AdjudicationReason.BlankBallot,
};

const blankPage: BlankPage = { type: 'BlankPage' };
const unreadable: UnreadablePage = {
  type: 'UnreadablePage',
  reason: 'too many black pixels',
};
const invalidTestMode: InvalidTestModePage = {
  type: 'InvalidTestModePage',
  metadata,
};
const invalidBallotHash: InvalidBallotHashPage = {
  type: 'InvalidBallotHashPage',
  expectedBallotHash:
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition()
      .ballotHash,
  actualBallotHash: 'something-else',
};
const invalidPrecinct: InvalidPrecinctPage = {
  type: 'InvalidPrecinctPage',
  metadata,
};
const bmdMulti: InterpretedBmdMultiPagePage = {
  type: 'InterpretedBmdMultiPagePage',
  metadata: {
    ballotHash: '41',
    precinctId: '12',
    ballotStyleId: '1' as BallotStyleId,
    isTestMode: true,
    ballotType: BallotType.Precinct,
    pageNumber: 1,
    totalPages: 2,
    ballotAuditId: 'audit-1' as BallotId,
    contestIds: ['contest-id'],
  },
  votes: {},
  adjudicationInfo: {
    requiresAdjudication: false,
    enabledReasons: [],
    enabledReasonInfos: [],
    ignoredReasonInfos: [],
  },
};

interface Case {
  name: string;
  front: PageInterpretation;
  back: PageInterpretation;
  expected: boolean;
}

describe('non-blank reasons trigger adjudication (each AdjudicationReason)', () => {
  test.each<Case>([
    {
      name: 'Undervote on front',
      front: hmpbWithReasons([undervoteReason]),
      back: hmpbWithVotes,
      expected: true,
    },
    {
      name: 'MarginalMark on front',
      front: hmpbWithReasons([marginalMarkReason]),
      back: hmpbWithVotes,
      expected: true,
    },
    {
      name: 'multiple reasons on one page',
      front: hmpbWithReasons([overvoteReason, marginalMarkReason]),
      back: hmpbWithVotes,
      expected: true,
    },
    {
      name: 'BlankBallot + Undervote (non-blank reason wins)',
      front: hmpbWithReasons([blankBallotReason, undervoteReason], {
        marks: 'zero-marks',
      }),
      back: hmpbWithVotes,
      expected: true,
    },
  ])('$name', ({ front, back, expected }) => {
    expect(sheetRequiresAdjudication([front, back])).toEqual(expected);
  });
});

describe('Invalid* pages and unreadable pages trigger adjudication', () => {
  test.each<Case>([
    {
      name: 'UnreadablePage front + clean HMPB back',
      front: unreadable,
      back: hmpbWithVotes,
      expected: true,
    },
    {
      name: 'clean HMPB front + UnreadablePage back',
      front: hmpbWithVotes,
      back: unreadable,
      expected: true,
    },
    {
      name: 'two UnreadablePages',
      front: unreadable,
      back: unreadable,
      expected: true,
    },
    {
      name: 'InvalidTestModePage + clean HMPB',
      front: invalidTestMode,
      back: hmpbWithVotes,
      expected: true,
    },
    {
      name: 'InvalidBallotHashPage + clean HMPB',
      front: invalidBallotHash,
      back: hmpbWithVotes,
      expected: true,
    },
    {
      name: 'InvalidPrecinctPage + clean HMPB',
      front: invalidPrecinct,
      back: hmpbWithVotes,
      expected: true,
    },
  ])('$name', ({ front, back, expected }) => {
    expect(sheetRequiresAdjudication([front, back])).toEqual(expected);
  });
});

test('BMDMulti short-circuits even when the other side is unreadable', () => {
  // Mirrors the original BMD + UnreadablePage case for the multi-page BMD
  // variant: when one side scans as BMD/BMDMulti and the other fails to
  // interpret, the BMD half short-circuits the whole sheet rather than
  // sending it to adjudication.
  expect(sheetRequiresAdjudication([bmdMulti, unreadable])).toEqual(false);
  expect(sheetRequiresAdjudication([unreadable, bmdMulti])).toEqual(false);
});

describe('zero-marks vs BlankBallot reason: both count as blank', () => {
  test.each<Case>([
    {
      name: 'two HMPB zero-marks pages → blank-both → adjudicate',
      front: hmpbWithReasons([], { marks: 'zero-marks' }),
      back: hmpbWithReasons([], { marks: 'zero-marks' }),
      expected: true,
    },
    {
      name: 'HMPB zero-marks + HMPB BlankBallot reason → blank-both',
      front: hmpbWithReasons([], { marks: 'zero-marks' }),
      back: hmpbNoVotes,
      expected: true,
    },
    {
      name: 'HMPB zero-marks + BlankPage → blank-both',
      front: hmpbWithReasons([], { marks: 'zero-marks' }),
      back: blankPage,
      expected: true,
    },
    {
      name: 'HMPB zero-marks + HMPB with marks → recessive, no adjudication',
      front: hmpbWithReasons([], { marks: 'zero-marks' }),
      back: hmpbWithVotes,
      expected: false,
    },
    {
      name: 'HMPB BlankBallot reason WITH marks (still counts as blank), both sides',
      front: hmpbWithReasons([blankBallotReason]),
      back: hmpbWithReasons([blankBallotReason]),
      expected: true,
    },
  ])('$name', ({ front, back, expected }) => {
    expect(sheetRequiresAdjudication([front, back])).toEqual(expected);
  });
});

describe('ignoredReasonInfos do not trigger adjudication', () => {
  test.each<Case>([
    {
      name: 'Overvote in ignoredReasonInfos (requiresAdjudication=false)',
      front: {
        ...pageInterpretationBoilerplate,
        adjudicationInfo: {
          enabledReasons: [],
          enabledReasonInfos: [],
          ignoredReasonInfos: [overvoteReason],
          requiresAdjudication: false,
        },
      },
      back: hmpbWithVotes,
      expected: false,
    },
    {
      name: 'Undervote in ignoredReasonInfos',
      front: {
        ...pageInterpretationBoilerplate,
        adjudicationInfo: {
          enabledReasons: [],
          enabledReasonInfos: [],
          ignoredReasonInfos: [undervoteReason],
          requiresAdjudication: false,
        },
      },
      back: hmpbWithVotes,
      expected: false,
    },
  ])('$name', ({ front, back, expected }) => {
    expect(sheetRequiresAdjudication([front, back])).toEqual(expected);
  });
});

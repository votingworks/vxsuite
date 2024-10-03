import { throwIllegalValue } from '@votingworks/basics';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import {
  AdjudicationReason,
  BallotIdSchema,
  BallotMetadata,
  BallotStyleId,
  BallotType,
  BlankPage,
  InterpretedBmdPage,
  InterpretedHmpbPage,
  PageInterpretation,
  UnreadablePage,
  unsafeParse,
} from '@votingworks/types';
import { sheetRequiresAdjudication } from './sheet_requires_adjudication';

const metadata: BallotMetadata = {
  ballotStyleId: '12' as BallotStyleId,
  ballotType: BallotType.Precinct,
  ballotHash:
    electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition
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
    ballotId: unsafeParse(BallotIdSchema, '42'),
    metadata: {
      ballotHash: '41',
      precinctId: '12',
      ballotStyleId: '1' as BallotStyleId,
      isTestMode: true,
      ballotType: BallotType.Precinct,
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

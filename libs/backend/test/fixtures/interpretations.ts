/* eslint-disable vx/gts-jsdoc */
import { assertDefined, find } from '@votingworks/basics';
import {
  AdjudicationInfo,
  BallotMetadata,
  BallotType,
  BlankPage,
  CandidateContest,
  InterpretedBmdPage,
  InterpretedHmpbPage,
  PageInterpretation,
  SheetOf,
  TargetShape,
  YesNoContest,
} from '@votingworks/types';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';

const electionDefinition = readElectionTwoPartyPrimaryDefinition();
const { election, ballotHash } = electionDefinition;

export const fishingContest = find(
  election.contests,
  (contest) => contest.id === 'fishing'
) as YesNoContest;
export const fishCouncilContest = find(
  election.contests,
  (contest) => contest.id === 'aquarium-council-fish'
) as CandidateContest;
export const bestFishContest = find(
  election.contests,
  (contest) => contest.id === 'best-animal-fish'
) as CandidateContest;

export const mockBallotMetadata: BallotMetadata = {
  ballotHash,
  precinctId: 'precinct-1',
  ballotStyleId: '2F',
  isTestMode: true,
  ballotType: BallotType.Precinct,
};
const adjudicationInfo: AdjudicationInfo = {
  requiresAdjudication: false,
  enabledReasons: [],
  enabledReasonInfos: [],
  ignoredReasonInfos: [],
};
const defaultShape: TargetShape = {
  bounds: { x: 0, y: 0, width: 10, height: 10 },
  inner: { x: 0, y: 0, width: 10, height: 10 },
};

export const interpretedHmpbPage1: InterpretedHmpbPage = {
  type: 'InterpretedHmpbPage',
  metadata: {
    ...mockBallotMetadata,
    pageNumber: 1,
  },
  markInfo: {
    marks: [
      {
        type: 'candidate',
        bounds: defaultShape.bounds,
        contestId: fishCouncilContest.id,
        target: defaultShape,
        optionId: assertDefined(fishCouncilContest.candidates[0]).id,
        score: 0.16,
        scoredOffset: { x: 1, y: 1 },
      },
    ],
    ballotSize: { width: 0, height: 0 },
  },
  adjudicationInfo,
  votes: {
    [fishCouncilContest.id]: fishCouncilContest.candidates.slice(0, 1),
  },
  layout: {
    pageSize: { width: 0, height: 0 },
    metadata: {
      ...mockBallotMetadata,
      pageNumber: 1,
    },
    contests: [
      {
        contestId: fishCouncilContest.id,
        bounds: defaultShape.bounds,
        corners: [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
        options: [
          {
            target: defaultShape,
            bounds: defaultShape.bounds,
            definition: {
              type: 'candidate',
              id: assertDefined(fishCouncilContest.candidates[0]).id,
              contestId: fishCouncilContest.id,
              isWriteIn: false,
            },
          },
        ],
      },
    ],
  },
};

export const interpretedHmpbPage2: InterpretedHmpbPage = {
  type: 'InterpretedHmpbPage',
  metadata: {
    ...mockBallotMetadata,
    pageNumber: 2,
  },
  markInfo: {
    marks: [
      {
        type: 'yesno',
        bounds: defaultShape.bounds,
        contestId: fishingContest.id,
        target: defaultShape,
        optionId: fishingContest.options[1].id,
        score: 0.17,
        scoredOffset: { x: 1, y: 1 },
      },
      {
        type: 'yesno',
        bounds: defaultShape.bounds,
        contestId: fishingContest.id,
        target: defaultShape,
        optionId: fishingContest.options[0].id,
        score: 0.03,
        scoredOffset: { x: 1, y: 1 },
      },
    ],
    ballotSize: { width: 0, height: 0 },
  },
  adjudicationInfo,
  votes: {
    [fishingContest.id]: [fishingContest.options[1].id],
  },
  layout: {
    pageSize: { width: 0, height: 0 },
    metadata: {
      ...mockBallotMetadata,
      pageNumber: 1,
    },
    contests: [
      {
        contestId: fishingContest.id,
        bounds: defaultShape.bounds,
        corners: [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
        options: [
          {
            target: defaultShape,
            bounds: defaultShape.bounds,
            definition: {
              type: 'yesno',
              id: fishingContest.options[0].id,
              contestId: fishingContest.id,
            },
          },
        ],
      },
    ],
  },
};

export const interpretedHmpbPage2WithMarginalMark: InterpretedHmpbPage = {
  ...interpretedHmpbPage2,
  markInfo: {
    ...interpretedHmpbPage2.markInfo,
    marks: interpretedHmpbPage2.markInfo.marks.map((mark) =>
      mark.optionId === fishingContest.options[0].id
        ? { ...mark, score: 0.09 }
        : mark
    ),
  },
};

export const interpretedBmdPage: InterpretedBmdPage = {
  type: 'InterpretedBmdPage',
  metadata: {
    ...mockBallotMetadata,
    pageNumber: 1,
    totalPages: 1,
    ballotAuditId: 'audit-fixture',
    contestIds: [fishingContest.id, fishCouncilContest.id],
  },
  votes: {
    [fishingContest.id]: [fishingContest.options[1].id],
    [fishCouncilContest.id]: fishCouncilContest.candidates.slice(0, 1),
  },
  adjudicationInfo: {
    requiresAdjudication: false,
    ignoredReasonInfos: [],
    enabledReasonInfos: [],
    enabledReasons: [],
  },
};

export const interpretedBmdPageWithWriteIn: InterpretedBmdPage = {
  type: 'InterpretedBmdPage',
  metadata: {
    ...mockBallotMetadata,
    pageNumber: 1,
    totalPages: 1,
    ballotAuditId: 'audit-fixture-write-in',
    contestIds: [fishingContest.id, fishCouncilContest.id],
  },
  votes: {
    [fishingContest.id]: [fishingContest.options[1].id],
    [fishCouncilContest.id]: [
      { id: 'write-in-1', name: 'Write In #1', isWriteIn: true },
    ],
  },
  adjudicationInfo: {
    requiresAdjudication: false,
    ignoredReasonInfos: [],
    enabledReasonInfos: [],
    enabledReasons: [],
  },
};

export const interpretedHmpbPage1WithWriteIn: InterpretedHmpbPage = {
  ...interpretedHmpbPage1,
  votes: {
    [fishCouncilContest.id]: [
      { id: 'write-in-1', name: 'Write In #1', isWriteIn: true },
    ],
  },
};

export const interpretedHmpbPage1WithUnmarkedWriteIn: InterpretedHmpbPage = {
  ...interpretedHmpbPage1,
  votes: {
    [fishCouncilContest.id]: [],
  },
  unmarkedWriteIns: [
    {
      contestId: fishCouncilContest.id,
      optionId: 'write-in-1',
    },
  ],
};

export const blankPage: BlankPage = {
  type: 'BlankPage',
};

export const interpretedHmpb: SheetOf<PageInterpretation> = [
  interpretedHmpbPage1,
  interpretedHmpbPage2,
];

export const interpretedBmdBallot: SheetOf<PageInterpretation> = [
  interpretedBmdPage,
  blankPage,
];

export const interpretedBmdBallotWithWriteIn: SheetOf<PageInterpretation> = [
  interpretedBmdPageWithWriteIn,
  blankPage,
];

export const interpretedHmpbWithWriteIn: SheetOf<PageInterpretation> = [
  interpretedHmpbPage1WithWriteIn,
  interpretedHmpbPage2,
];

export const interpretedHmpbWithUnmarkedWriteIn: SheetOf<PageInterpretation> = [
  interpretedHmpbPage1WithUnmarkedWriteIn,
  interpretedHmpbPage2,
];

export const interpretedBmdPage1: InterpretedBmdPage = {
  type: 'InterpretedBmdPage',
  metadata: {
    ballotHash,
    precinctId: 'precinct-1',
    ballotStyleId: '2F',
    isTestMode: true,
    ballotType: BallotType.Precinct,
    pageNumber: 1,
    totalPages: 2,
    ballotAuditId: 'audit-123',
    contestIds: [fishCouncilContest.id],
  },
  votes: {
    [fishCouncilContest.id]: fishCouncilContest.candidates.slice(0, 1),
  },
  adjudicationInfo: {
    requiresAdjudication: false,
    ignoredReasonInfos: [],
    enabledReasonInfos: [],
    enabledReasons: [],
  },
};

export const interpretedBmdPage2: InterpretedBmdPage = {
  type: 'InterpretedBmdPage',
  metadata: {
    ballotHash,
    precinctId: 'precinct-1',
    ballotStyleId: '2F',
    isTestMode: true,
    ballotType: BallotType.Precinct,
    pageNumber: 2,
    totalPages: 2,
    ballotAuditId: 'audit-123',
    contestIds: [fishingContest.id],
  },
  votes: {
    [fishingContest.id]: [fishingContest.options[1].id],
  },
  adjudicationInfo: {
    requiresAdjudication: false,
    ignoredReasonInfos: [],
    enabledReasonInfos: [],
    enabledReasons: [],
  },
};

export const interpretedBmdBallot1: SheetOf<PageInterpretation> = [
  interpretedBmdPage1,
  blankPage,
];

export const interpretedBmdBallot2: SheetOf<PageInterpretation> = [
  interpretedBmdPage2,
  blankPage,
];

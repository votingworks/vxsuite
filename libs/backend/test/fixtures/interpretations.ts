/* eslint-disable vx/gts-jsdoc */
import { assertDefined, find } from '@votingworks/basics';
import {
  AdjudicationInfo,
  BallotMetadata,
  BallotStyleId,
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
  ballotStyleId: '2F' as BallotStyleId,
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
              name: assertDefined(fishCouncilContest.candidates[0]).name,
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
        optionId: fishingContest.noOption.id,
        score: 0.17,
        scoredOffset: { x: 1, y: 1 },
      },
      {
        type: 'yesno',
        bounds: defaultShape.bounds,
        contestId: fishingContest.id,
        target: defaultShape,
        optionId: fishingContest.yesOption.id,
        score: 0.03,
        scoredOffset: { x: 1, y: 1 },
      },
    ],
    ballotSize: { width: 0, height: 0 },
  },
  adjudicationInfo,
  votes: {
    [fishingContest.id]: [fishingContest.noOption.id],
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
              id: fishingContest.yesOption.id,
              name: 'Yes',
              contestId: fishingContest.id,
            },
          },
        ],
      },
    ],
  },
};

export const interpretedBmdPage: InterpretedBmdPage = {
  type: 'InterpretedBmdPage',
  metadata: mockBallotMetadata,
  votes: {
    [fishingContest.id]: [fishingContest.noOption.id],
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
  metadata: mockBallotMetadata,
  votes: {
    [fishingContest.id]: [fishingContest.noOption.id],
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

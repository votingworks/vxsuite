import {
  BallotIdSchema,
  BallotMetadata,
  BallotType,
  BlankPage,
  InterpretedBmdPage,
  InterpretedHmpbPage,
  UnreadablePage,
  unsafeParse,
} from '@votingworks/types';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { Castability, checkSheetCastability } from './castability';

const metadata: BallotMetadata = {
  ballotStyleId: '1',
  precinctId: '6522',
  ballotType: BallotType.Precinct,
  electionHash:
    electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition
      .electionHash,
  isTestMode: false,
};
const interpretedBmdPage: Readonly<InterpretedBmdPage> = {
  type: 'InterpretedBmdPage',
  ballotId: unsafeParse(BallotIdSchema, 'abc'),
  metadata,
  votes: {
    'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc':
      [
        'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc-option-yes',
      ],
  },
};

const interpretedHmpbPage: Readonly<InterpretedHmpbPage> = {
  type: 'InterpretedHmpbPage',
  ballotId: unsafeParse(BallotIdSchema, 'abcdefg'),
  metadata: {
    ...metadata,
    pageNumber: 1,
  },
  markInfo: { marks: [], ballotSize: { width: 1, height: 1 } },
  adjudicationInfo: {
    requiresAdjudication: false,
    enabledReasons: [],
    enabledReasonInfos: [],
    ignoredReasonInfos: [],
  },
  votes: {},
  layout: {
    pageSize: { width: 1, height: 1 },
    metadata: {
      ...metadata,
      pageNumber: 1,
    },
    contests: [],
  },
};

const interpretedHmpbPageRequiringAdjudication: Readonly<InterpretedHmpbPage> =
  {
    ...interpretedHmpbPage,
    adjudicationInfo: {
      ...interpretedHmpbPage.adjudicationInfo,
      requiresAdjudication: true,
    },
  };

const unreadablePage: Readonly<UnreadablePage> = { type: 'UnreadablePage' };

const blankPage: Readonly<BlankPage> = {
  type: 'BlankPage',
};

test('castability of a BMD ballot', () => {
  expect(checkSheetCastability([interpretedBmdPage, blankPage])).toEqual(
    Castability.CastableWithoutReview
  );
  expect(checkSheetCastability([blankPage, interpretedBmdPage])).toEqual(
    Castability.CastableWithoutReview
  );
});

test('castability of a blank sheet', () => {
  expect(checkSheetCastability([blankPage, blankPage])).toEqual(
    Castability.Uncastable
  );
});

test('castability of a HMPB ballot not requiring adjudication', () => {
  expect(
    checkSheetCastability([interpretedHmpbPage, interpretedHmpbPage])
  ).toEqual(Castability.CastableWithoutReview);
});

test('castability of a HMPB ballot requiring adjudication', () => {
  expect(
    checkSheetCastability([
      interpretedHmpbPageRequiringAdjudication,
      interpretedHmpbPage,
    ])
  ).toEqual(Castability.CastableWithReview);
  expect(
    checkSheetCastability([
      interpretedHmpbPage,
      interpretedHmpbPageRequiringAdjudication,
    ])
  ).toEqual(Castability.CastableWithReview);
});

test('castability of an unreadable ballot', () => {
  expect(checkSheetCastability([unreadablePage, unreadablePage])).toEqual(
    Castability.Uncastable
  );
});

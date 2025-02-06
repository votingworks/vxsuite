import { expect, test } from 'vitest';
import {
  BallotMetadata,
  BallotStyleId,
  BallotType,
  BlankPage,
  InterpretedBmdPage,
  InterpretedHmpbPage,
} from '@votingworks/types';
import {
  describeValidationError,
  validateSheetInterpretation,
  ValidationError,
  ValidationErrorType,
} from './validation';

const BmdPage: InterpretedBmdPage = {
  type: 'InterpretedBmdPage',
  metadata: {
    ballotStyleId: '12' as BallotStyleId,
    precinctId: '23',
    ballotType: BallotType.Absentee,
    ballotHash: 'abc',
    isTestMode: false,
  },
  adjudicationInfo: {
    requiresAdjudication: false,
    ignoredReasonInfos: [],
    enabledReasonInfos: [],
    enabledReasons: [],
  },
  votes: {},
};

const BlankPageInstance: BlankPage = {
  type: 'BlankPage',
};

const metadata: BallotMetadata = {
  ballotStyleId: '12' as BallotStyleId,
  precinctId: '23',
  ballotType: BallotType.Absentee,
  ballotHash: 'abc',
  isTestMode: false,
};
const HmpbPage1: InterpretedHmpbPage = {
  type: 'InterpretedHmpbPage',
  metadata: {
    ...metadata,
    pageNumber: 1,
  },
  adjudicationInfo: {
    requiresAdjudication: false,
    enabledReasons: [],
    enabledReasonInfos: [],
    ignoredReasonInfos: [],
  },
  markInfo: {
    marks: [],
    ballotSize: { width: 1, height: 1 },
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
const HmpbPage2: InterpretedHmpbPage = {
  ...HmpbPage1,
  metadata: {
    ...HmpbPage1.metadata,
    pageNumber: 2,
  },
  layout: {
    ...HmpbPage1.layout,
    metadata: {
      ...HmpbPage1.layout.metadata,
      pageNumber: 2,
    },
  },
};

test('BMD ballot', () => {
  expect(
    validateSheetInterpretation([BmdPage, BlankPageInstance]).err()
  ).toBeUndefined();
});

test('BMD ballot reversed', () => {
  expect(
    validateSheetInterpretation([BmdPage, BlankPageInstance]).err()
  ).toBeUndefined();
});

test('BMD ballot with two BMD sides', () => {
  const error = validateSheetInterpretation([
    BmdPage,
    BmdPage,
  ]).unsafeUnwrapErr();
  expect(error).toEqual<ValidationError>({
    type: ValidationErrorType.InvalidFrontBackPageTypes,
    types: ['InterpretedBmdPage', 'InterpretedBmdPage'],
  });
  expect(describeValidationError(error)).toEqual(
    `expected the back of a BMD page to be blank, but got 'InterpretedBmdPage'`
  );
});

test('HMPB ballot with non-consecutive pages', () => {
  const error = validateSheetInterpretation([
    HmpbPage1,
    HmpbPage1,
  ]).unsafeUnwrapErr();
  expect(error).toEqual<ValidationError>({
    type: ValidationErrorType.NonConsecutivePages,
    pageNumbers: [1, 1],
  });
  expect(describeValidationError(error)).toEqual(
    `expected a sheet to have consecutive page numbers, but got front=1 back=1`
  );
});

test('HMPB ballot with mismatched ballot style', () => {
  const error = validateSheetInterpretation([
    HmpbPage1,
    {
      ...HmpbPage2,
      metadata: { ...HmpbPage2.metadata, ballotStyleId: '34' as BallotStyleId },
    },
  ]).unsafeUnwrapErr();
  expect(error).toEqual<ValidationError>({
    type: ValidationErrorType.MismatchedBallotStyle,
    ballotStyleIds: ['12' as BallotStyleId, '34' as BallotStyleId],
  });
  expect(describeValidationError(error)).toEqual(
    `expected a sheet to have the same ballot style, but got front=12 back=34`
  );
});

test('HMPB ballot with mismatched precinct', () => {
  const error = validateSheetInterpretation([
    HmpbPage1,
    {
      ...HmpbPage2,
      metadata: { ...HmpbPage2.metadata, precinctId: '34' },
    },
  ]).unsafeUnwrapErr();

  expect(error).toEqual<ValidationError>({
    type: ValidationErrorType.MismatchedPrecinct,
    precinctIds: ['23', '34'],
  });
  expect(describeValidationError(error)).toEqual(
    `expected a sheet to have the same precinct, but got front=23 back=34`
  );
});

test('HMPB ballot with mismatched election', () => {
  const error = validateSheetInterpretation([
    HmpbPage1,
    {
      ...HmpbPage2,
      metadata: { ...HmpbPage2.metadata, ballotHash: 'def' },
    },
  ]).unsafeUnwrapErr();

  expect(error).toEqual<ValidationError>({
    type: ValidationErrorType.MismatchedBallotHash,
    ballotHashes: ['abc', 'def'],
  });
  expect(describeValidationError(error)).toEqual(
    `expected a sheet to have the same ballot hash, but got front=abc back=def`
  );
});

test('HMPB ballot with mismatched ballot type', () => {
  const error = validateSheetInterpretation([
    HmpbPage1,
    {
      ...HmpbPage2,
      metadata: { ...HmpbPage2.metadata, ballotType: BallotType.Precinct },
    },
  ]).unsafeUnwrapErr();

  expect(error).toEqual<ValidationError>({
    type: ValidationErrorType.MismatchedBallotType,
    ballotTypes: [BallotType.Absentee, BallotType.Precinct],
  });
  expect(describeValidationError(error)).toEqual(
    `expected a sheet to have the same ballot type, but got front=absentee back=precinct`
  );
});

test('sheet with HMPB and BMD pages', () => {
  const error = validateSheetInterpretation([
    HmpbPage1,
    BmdPage,
  ]).unsafeUnwrapErr();
  expect(error).toEqual<ValidationError>({
    type: ValidationErrorType.InvalidFrontBackPageTypes,
    types: ['InterpretedHmpbPage', 'InterpretedBmdPage'],
  });
  expect(describeValidationError(error)).toEqual(
    `expected the a HMPB page to be another HMPB page, but got 'InterpretedBmdPage'`
  );
});

test('sheet with BMD and HMPB pages', () => {
  const error = validateSheetInterpretation([
    BmdPage,
    HmpbPage1,
  ]).unsafeUnwrapErr();
  expect(error).toEqual<ValidationError>({
    type: ValidationErrorType.InvalidFrontBackPageTypes,
    types: ['InterpretedBmdPage', 'InterpretedHmpbPage'],
  });
  expect(describeValidationError(error)).toEqual(
    `expected the back of a BMD page to be blank, but got 'InterpretedHmpbPage'`
  );
});

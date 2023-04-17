import {
  BallotType,
  BlankPage,
  InterpretedBmdPage,
  InterpretedHmpbPage,
} from '@votingworks/types';
import { typedAs } from '@votingworks/basics';
import {
  describeValidationError,
  validateSheetInterpretation,
  ValidationError,
  ValidationErrorType,
} from './validation';

const BmdPage: InterpretedBmdPage = {
  type: 'InterpretedBmdPage',
  metadata: {
    ballotStyleId: '12',
    precinctId: '23',
    ballotType: BallotType.Absentee,
    electionHash: 'abc',
    isTestMode: false,
    locales: { primary: 'en-US' },
  },
  votes: {},
};

const BlankPage: BlankPage = {
  type: 'BlankPage',
};

const HmpbPage1: InterpretedHmpbPage = {
  type: 'InterpretedHmpbPage',
  metadata: {
    ballotStyleId: '12',
    precinctId: '23',
    pageNumber: 1,
    ballotType: BallotType.Absentee,
    electionHash: 'abc',
    isTestMode: false,
    locales: { primary: 'en-US' },
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
};
const HmpbPage2: InterpretedHmpbPage = {
  ...HmpbPage1,
  metadata: {
    ...HmpbPage1.metadata,
    pageNumber: 2,
  },
};

test('BMD ballot', () => {
  expect(
    validateSheetInterpretation([BmdPage, BlankPage]).err()
  ).toBeUndefined();
});

test('BMD ballot reversed', () => {
  expect(
    validateSheetInterpretation([BmdPage, BlankPage]).err()
  ).toBeUndefined();
});

test('BMD ballot with two BMD sides', () => {
  const error = validateSheetInterpretation([
    BmdPage,
    BmdPage,
  ]).unsafeUnwrapErr();
  expect(error).toEqual(
    typedAs<ValidationError>({
      type: ValidationErrorType.InvalidFrontBackPageTypes,
      types: ['InterpretedBmdPage', 'InterpretedBmdPage'],
    })
  );
  expect(describeValidationError(error)).toEqual(
    `expected the back of a BMD page to be blank, but got 'InterpretedBmdPage'`
  );
});

test('HMPB ballot with non-consecutive pages', () => {
  const error = validateSheetInterpretation([
    HmpbPage1,
    HmpbPage1,
  ]).unsafeUnwrapErr();
  expect(error).toEqual(
    typedAs<ValidationError>({
      type: ValidationErrorType.NonConsecutivePages,
      pageNumbers: [1, 1],
    })
  );
  expect(describeValidationError(error)).toEqual(
    `expected a sheet to have consecutive page numbers, but got front=1 back=1`
  );
});

test('HMPB ballot with mismatched ballot style', () => {
  const error = validateSheetInterpretation([
    HmpbPage1,
    {
      ...HmpbPage2,
      metadata: { ...HmpbPage2.metadata, ballotStyleId: '34' },
    },
  ]).unsafeUnwrapErr();
  expect(error).toEqual(
    typedAs<ValidationError>({
      type: ValidationErrorType.MismatchedBallotStyle,
      ballotStyleIds: ['12', '34'],
    })
  );
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

  expect(error).toEqual(
    typedAs<ValidationError>({
      type: ValidationErrorType.MismatchedPrecinct,
      precinctIds: ['23', '34'],
    })
  );
  expect(describeValidationError(error)).toEqual(
    `expected a sheet to have the same precinct, but got front=23 back=34`
  );
});

test('HMPB ballot with mismatched election', () => {
  const error = validateSheetInterpretation([
    HmpbPage1,
    {
      ...HmpbPage2,
      metadata: { ...HmpbPage2.metadata, electionHash: 'def' },
    },
  ]).unsafeUnwrapErr();

  expect(error).toEqual(
    typedAs<ValidationError>({
      type: ValidationErrorType.MismatchedElectionHash,
      electionHashes: ['abc', 'def'],
    })
  );
  expect(describeValidationError(error)).toEqual(
    `expected a sheet to have the same election hash, but got front=abc back=def`
  );
});

test('HMPB ballot with mismatched ballot type', () => {
  const error = validateSheetInterpretation([
    HmpbPage1,
    {
      ...HmpbPage2,
      metadata: { ...HmpbPage2.metadata, ballotType: BallotType.Standard },
    },
  ]).unsafeUnwrapErr();

  expect(error).toEqual(
    typedAs<ValidationError>({
      type: ValidationErrorType.MismatchedBallotType,
      ballotTypes: [BallotType.Absentee, BallotType.Standard],
    })
  );
  expect(describeValidationError(error)).toEqual(
    `expected a sheet to have the same ballot type, but got front=Absentee back=Standard`
  );
});

test('sheet with HMPB and BMD pages', () => {
  const error = validateSheetInterpretation([
    HmpbPage1,
    BmdPage,
  ]).unsafeUnwrapErr();
  expect(error).toEqual(
    typedAs<ValidationError>({
      type: ValidationErrorType.InvalidFrontBackPageTypes,
      types: ['InterpretedHmpbPage', 'InterpretedBmdPage'],
    })
  );
  expect(describeValidationError(error)).toEqual(
    `expected the a HMPB page to be another HMPB page, but got 'InterpretedBmdPage'`
  );
});

test('sheet with BMD and HMPB pages', () => {
  const error = validateSheetInterpretation([
    BmdPage,
    HmpbPage1,
  ]).unsafeUnwrapErr();
  expect(error).toEqual(
    typedAs<ValidationError>({
      type: ValidationErrorType.InvalidFrontBackPageTypes,
      types: ['InterpretedBmdPage', 'InterpretedHmpbPage'],
    })
  );
  expect(describeValidationError(error)).toEqual(
    `expected the back of a BMD page to be blank, but got 'InterpretedHmpbPage'`
  );
});

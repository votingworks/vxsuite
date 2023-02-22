import {
  BallotType,
  BlankPage,
  UninterpretedHmpbPage,
} from '@votingworks/types';
import { typedAs } from '@votingworks/basics';
import {
  describeSheetValidationError,
  validateSheetInterpretation,
  SheetValidationError,
  SheetValidationErrorType,
} from './validation';
import {
  interpretedBmdPage,
  interpretedHmpbPage1,
  interpretedHmpbPage2,
} from '../../../test/fixtures/interpretations';

const blankPage: BlankPage = {
  type: 'BlankPage',
};

const uninterpretedHmpbPage: UninterpretedHmpbPage = {
  type: 'UninterpretedHmpbPage',
  metadata: interpretedHmpbPage1.metadata,
};

test('Invalid page type', () => {
  const error = validateSheetInterpretation([
    uninterpretedHmpbPage,
    uninterpretedHmpbPage,
  ]).err();
  expect(error).toMatchObject({
    type: 'InvalidPageType',
    pageTypes: ['UninterpretedHmpbPage', 'UninterpretedHmpbPage'],
  });

  expect(describeSheetValidationError(error!)).toEqual(
    `unable to export sheet which contains at least one invalid page type: UninterpretedHmpbPage, UninterpretedHmpbPage`
  );
});

test('BMD ballot', () => {
  expect(
    validateSheetInterpretation([interpretedBmdPage, blankPage]).ok()
  ).toMatchObject({
    type: 'bmd',
    interpretation: interpretedBmdPage,
  });
});

test('BMD ballot reversed', () => {
  expect(
    validateSheetInterpretation([blankPage, interpretedBmdPage]).ok()
  ).toMatchObject({
    type: 'bmd',
    interpretation: interpretedBmdPage,
  });
});

test('HMPB ballot', () => {
  expect(
    validateSheetInterpretation([
      interpretedHmpbPage1,
      interpretedHmpbPage2,
    ]).ok()
  ).toMatchObject({
    type: 'hmpb',
    interpretation: [interpretedHmpbPage1, interpretedHmpbPage2],
    wasReversed: false,
  });
});

test('HMPB ballot reversed', () => {
  expect(
    validateSheetInterpretation([
      interpretedHmpbPage2,
      interpretedHmpbPage1,
    ]).ok()
  ).toMatchObject({
    type: 'hmpb',
    interpretation: [interpretedHmpbPage1, interpretedHmpbPage2],
    wasReversed: true,
  });
});

test('BMD ballot with two BMD sides', () => {
  const error = validateSheetInterpretation([
    interpretedBmdPage,
    interpretedBmdPage,
  ]).unsafeUnwrapErr();
  expect(error).toEqual(
    typedAs<SheetValidationError>({
      type: SheetValidationErrorType.InvalidFrontBackPageTypes,
      types: ['InterpretedBmdPage', 'InterpretedBmdPage'],
    })
  );
  expect(describeSheetValidationError(error)).toEqual(
    `expected the back of a BMD page to be blank, but got 'InterpretedBmdPage'`
  );
});

test('HMPB ballot with non-consecutive pages', () => {
  const error = validateSheetInterpretation([
    interpretedHmpbPage1,
    interpretedHmpbPage1,
  ]).unsafeUnwrapErr();
  expect(error).toEqual(
    typedAs<SheetValidationError>({
      type: SheetValidationErrorType.NonConsecutivePages,
      pageNumbers: [1, 1],
    })
  );
  expect(describeSheetValidationError(error)).toEqual(
    `expected a sheet to have consecutive page numbers, but got front=1 back=1`
  );
});

test('HMPB ballot with mismatched ballot style', () => {
  const error = validateSheetInterpretation([
    interpretedHmpbPage1,
    {
      ...interpretedHmpbPage2,
      metadata: { ...interpretedHmpbPage2.metadata, ballotStyleId: '1M' },
    },
  ]).unsafeUnwrapErr();
  expect(error).toEqual(
    typedAs<SheetValidationError>({
      type: SheetValidationErrorType.MismatchedBallotStyle,
      ballotStyleIds: ['2F', '1M'],
    })
  );
  expect(describeSheetValidationError(error)).toEqual(
    `expected a sheet to have the same ballot style, but got front=2F back=1M`
  );
});

test('HMPB ballot with mismatched precinct', () => {
  const error = validateSheetInterpretation([
    interpretedHmpbPage1,
    {
      ...interpretedHmpbPage2,
      metadata: { ...interpretedHmpbPage2.metadata, precinctId: 'precinct-2' },
    },
  ]).unsafeUnwrapErr();

  expect(error).toEqual(
    typedAs<SheetValidationError>({
      type: SheetValidationErrorType.MismatchedPrecinct,
      precinctIds: ['precinct-1', 'precinct-2'],
    })
  );
  expect(describeSheetValidationError(error)).toEqual(
    `expected a sheet to have the same precinct, but got front=precinct-1 back=precinct-2`
  );
});

test('HMPB ballot with mismatched election', () => {
  const error = validateSheetInterpretation([
    {
      ...interpretedHmpbPage1,
      metadata: { ...interpretedHmpbPage1.metadata, electionHash: 'abc' },
    },
    {
      ...interpretedHmpbPage2,
      metadata: { ...interpretedHmpbPage2.metadata, electionHash: 'def' },
    },
  ]).unsafeUnwrapErr();

  expect(error).toEqual(
    typedAs<SheetValidationError>({
      type: SheetValidationErrorType.MismatchedElectionHash,
      electionHashes: ['abc', 'def'],
    })
  );
  expect(describeSheetValidationError(error)).toEqual(
    `expected a sheet to have the same election hash, but got front=abc back=def`
  );
});

test('HMPB ballot with mismatched ballot type', () => {
  const error = validateSheetInterpretation([
    interpretedHmpbPage1,
    {
      ...interpretedHmpbPage2,
      metadata: {
        ...interpretedHmpbPage2.metadata,
        ballotType: BallotType.Absentee,
      },
    },
  ]).unsafeUnwrapErr();

  expect(error).toEqual(
    typedAs<SheetValidationError>({
      type: SheetValidationErrorType.MismatchedBallotType,
      ballotTypes: [BallotType.Standard, BallotType.Absentee],
    })
  );
  expect(describeSheetValidationError(error)).toEqual(
    `expected a sheet to have the same ballot type, but got front=Standard back=Absentee`
  );
});

test('sheet with HMPB and BMD pages', () => {
  const error = validateSheetInterpretation([
    interpretedHmpbPage1,
    interpretedBmdPage,
  ]).unsafeUnwrapErr();
  expect(error).toEqual(
    typedAs<SheetValidationError>({
      type: SheetValidationErrorType.InvalidFrontBackPageTypes,
      types: ['InterpretedHmpbPage', 'InterpretedBmdPage'],
    })
  );
  expect(describeSheetValidationError(error)).toEqual(
    `expected the a HMPB page to be another HMPB page, but got 'InterpretedBmdPage'`
  );
});

test('sheet with BMD and HMPB pages', () => {
  const error = validateSheetInterpretation([
    interpretedBmdPage,
    interpretedHmpbPage1,
  ]).unsafeUnwrapErr();
  expect(error).toEqual(
    typedAs<SheetValidationError>({
      type: SheetValidationErrorType.InvalidFrontBackPageTypes,
      types: ['InterpretedBmdPage', 'InterpretedHmpbPage'],
    })
  );
  expect(describeSheetValidationError(error)).toEqual(
    `expected the back of a BMD page to be blank, but got 'InterpretedHmpbPage'`
  );
});

import { BallotType, BlankPage, SheetOf } from '@votingworks/types';
import { typedAs } from '@votingworks/basics';
import {
  describeSheetValidationError,
  canonicalizeSheet,
  SheetValidationError,
  SheetValidationErrorType,
} from './canonicalize';
import {
  interpretedBmdPage,
  interpretedHmpbPage1,
  interpretedHmpbPage2,
} from '../../test/fixtures/interpretations';

const blankPage: BlankPage = {
  type: 'BlankPage',
};

const filenames: SheetOf<string> = ['sideOne', 'sideTwo'];
const filenamesReversed: SheetOf<string> = ['sideTwo', 'sideOne'];

test('BMD ballot', () => {
  expect(
    canonicalizeSheet([interpretedBmdPage, blankPage], filenames).ok()
  ).toMatchObject({
    type: 'bmd',
    interpretation: interpretedBmdPage,
    filenames,
  });
});

test('BMD ballot reversed', () => {
  expect(
    canonicalizeSheet([blankPage, interpretedBmdPage], filenamesReversed).ok()
  ).toMatchObject({
    type: 'bmd',
    interpretation: interpretedBmdPage,
    filenames,
  });
});

test('HMPB ballot', () => {
  expect(
    canonicalizeSheet(
      [interpretedHmpbPage1, interpretedHmpbPage2],
      filenames
    ).ok()
  ).toMatchObject({
    type: 'hmpb',
    interpretation: [interpretedHmpbPage1, interpretedHmpbPage2],
    filenames,
  });
});

test('HMPB ballot reversed', () => {
  expect(
    canonicalizeSheet(
      [interpretedHmpbPage2, interpretedHmpbPage1],
      filenamesReversed
    ).ok()
  ).toMatchObject({
    type: 'hmpb',
    interpretation: [interpretedHmpbPage1, interpretedHmpbPage2],
    filenames,
  });
});

test('BMD ballot with two BMD sides', () => {
  const error = canonicalizeSheet(
    [interpretedBmdPage, interpretedBmdPage],
    filenames
  ).unsafeUnwrapErr();
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
  const error = canonicalizeSheet(
    [interpretedHmpbPage1, interpretedHmpbPage1],
    filenames
  ).unsafeUnwrapErr();
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
  const error = canonicalizeSheet(
    [
      interpretedHmpbPage1,
      {
        ...interpretedHmpbPage2,
        metadata: { ...interpretedHmpbPage2.metadata, ballotStyleId: '1M' },
      },
    ],
    filenames
  ).unsafeUnwrapErr();
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
  const error = canonicalizeSheet(
    [
      interpretedHmpbPage1,
      {
        ...interpretedHmpbPage2,
        metadata: {
          ...interpretedHmpbPage2.metadata,
          precinctId: 'precinct-2',
        },
      },
    ],
    filenames
  ).unsafeUnwrapErr();

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
  const error = canonicalizeSheet(
    [
      {
        ...interpretedHmpbPage1,
        metadata: { ...interpretedHmpbPage1.metadata, electionHash: 'abc' },
      },
      {
        ...interpretedHmpbPage2,
        metadata: { ...interpretedHmpbPage2.metadata, electionHash: 'def' },
      },
    ],
    filenames
  ).unsafeUnwrapErr();

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
  const error = canonicalizeSheet(
    [
      interpretedHmpbPage1,
      {
        ...interpretedHmpbPage2,
        metadata: {
          ...interpretedHmpbPage2.metadata,
          ballotType: BallotType.Absentee,
        },
      },
    ],
    filenames
  ).unsafeUnwrapErr();

  expect(error).toEqual(
    typedAs<SheetValidationError>({
      type: SheetValidationErrorType.MismatchedBallotType,
      ballotTypes: [BallotType.Precinct, BallotType.Absentee],
    })
  );
  expect(describeSheetValidationError(error)).toEqual(
    `expected a sheet to have the same ballot type, but got front=precinct back=absentee`
  );
});

test('sheet with HMPB and BMD pages', () => {
  const error = canonicalizeSheet(
    [interpretedHmpbPage1, interpretedBmdPage],
    filenames
  ).unsafeUnwrapErr();
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
  const error = canonicalizeSheet(
    [interpretedBmdPage, interpretedHmpbPage1],
    filenames
  ).unsafeUnwrapErr();
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

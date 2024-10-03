import {
  BallotStyleId,
  BallotType,
  BlankPage,
  SheetOf,
  SheetValidationError,
} from '@votingworks/types';
import { canonicalizeSheet } from './canonicalize';
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
  expect(error).toEqual<SheetValidationError>({
    type: 'invalid-sheet',
    subType: 'incompatible-interpretation-types',
    interpretationTypes: ['InterpretedBmdPage', 'InterpretedBmdPage'],
  });
});

test('HMPB ballot with non-consecutive pages', () => {
  const error = canonicalizeSheet(
    [interpretedHmpbPage1, interpretedHmpbPage1],
    filenames
  ).unsafeUnwrapErr();
  expect(error).toEqual<SheetValidationError>({
    type: 'invalid-sheet',
    subType: 'non-consecutive-page-numbers',
    pageNumbers: [1, 1],
  });
});

test('HMPB ballot with mismatched ballot style', () => {
  const error = canonicalizeSheet(
    [
      interpretedHmpbPage1,
      {
        ...interpretedHmpbPage2,
        metadata: {
          ...interpretedHmpbPage2.metadata,
          ballotStyleId: '1M' as BallotStyleId,
        },
      },
    ],
    filenames
  ).unsafeUnwrapErr();
  expect(error).toEqual<SheetValidationError>({
    type: 'invalid-sheet',
    subType: 'mismatched-ballot-style-ids',
    ballotStyleIds: ['2F' as BallotStyleId, '1M' as BallotStyleId],
  });
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

  expect(error).toEqual<SheetValidationError>({
    type: 'invalid-sheet',
    subType: 'mismatched-precinct-ids',
    precinctIds: ['precinct-1', 'precinct-2'],
  });
});

test('HMPB ballot with mismatched election', () => {
  const error = canonicalizeSheet(
    [
      {
        ...interpretedHmpbPage1,
        metadata: { ...interpretedHmpbPage1.metadata, ballotHash: 'abc' },
      },
      {
        ...interpretedHmpbPage2,
        metadata: { ...interpretedHmpbPage2.metadata, ballotHash: 'def' },
      },
    ],
    filenames
  ).unsafeUnwrapErr();

  expect(error).toEqual<SheetValidationError>({
    type: 'invalid-sheet',
    subType: 'mismatched-ballot-hashes',
    ballotHashes: ['abc', 'def'],
  });
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

  expect(error).toEqual<SheetValidationError>({
    type: 'invalid-sheet',
    subType: 'mismatched-ballot-types',
    ballotTypes: [BallotType.Precinct, BallotType.Absentee],
  });
});

test('sheet with HMPB and BMD pages', () => {
  const error = canonicalizeSheet(
    [interpretedHmpbPage1, interpretedBmdPage],
    filenames
  ).unsafeUnwrapErr();
  expect(error).toEqual<SheetValidationError>({
    type: 'invalid-sheet',
    subType: 'incompatible-interpretation-types',
    interpretationTypes: ['InterpretedHmpbPage', 'InterpretedBmdPage'],
  });
});

test('sheet with BMD and HMPB pages', () => {
  const error = canonicalizeSheet(
    [interpretedBmdPage, interpretedHmpbPage1],
    filenames
  ).unsafeUnwrapErr();
  expect(error).toEqual<SheetValidationError>({
    type: 'invalid-sheet',
    subType: 'incompatible-interpretation-types',
    interpretationTypes: ['InterpretedBmdPage', 'InterpretedHmpbPage'],
  });
});

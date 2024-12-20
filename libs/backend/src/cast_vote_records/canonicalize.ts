import {
  InterpretedBmdPage,
  InterpretedHmpbPage,
  PageInterpretation,
  SheetOf,
  SheetValidationError,
} from '@votingworks/types';
import { Result, ok, err } from '@votingworks/basics';

/**
 * The back of a BMD ballot should be empty, which could be interpreted as
 * either a blank or an unreadable page.
 */
const EMPTY_PAGE_TYPES: ReadonlyArray<PageInterpretation['type']> = [
  'BlankPage',
  'UnreadablePage',
];

/**
 * Validated sheet from the database in a standard format:
 * - `type` indicates whether this is a hand- or machine-marked ballot
 * - `interpretation` is the page interpretations ordered `[front, back]`
 * for HMPB ballots. It is a single page interpretation for BMD ballots
 * - `wasReversed` indicates whether the passed original sheet was in reverse
 * order
 */
export type CanonicalizedSheet =
  | {
      type: 'bmd';
      interpretation: InterpretedBmdPage;
      filenames: SheetOf<string>;
    }
  | {
      type: 'hmpb';
      interpretation: SheetOf<InterpretedHmpbPage>;
      filenames: SheetOf<string>;
    };

/**
 * Validates and canonicalizes sheet interpretations. When successful, returns
 * a {@link CanonicalizedSheet}. When validation fails, returns a {@link SheetValidationError}
 */
export function canonicalizeSheet(
  [front, back]: SheetOf<PageInterpretation>,
  [frontFilename, backFilename]: SheetOf<string>
): Result<CanonicalizedSheet, SheetValidationError> {
  // Valid and correctly oriented BMD sheet
  if (
    front.type === 'InterpretedBmdPage' &&
    EMPTY_PAGE_TYPES.includes(back.type)
  ) {
    return ok({
      type: 'bmd',
      interpretation: front,
      filenames: [frontFilename, backFilename],
    });
  }

  // Valid but reverse oriented BMD sheet
  if (
    EMPTY_PAGE_TYPES.includes(front.type) &&
    back.type === 'InterpretedBmdPage'
  ) {
    return ok({
      type: 'bmd',
      interpretation: back,
      filenames: [backFilename, frontFilename],
    });
  }

  // We don't have a valid BMD ballot, so the sheet should be a valid HMPB sheet
  if (
    front.type !== 'InterpretedHmpbPage' ||
    back.type !== 'InterpretedHmpbPage'
  ) {
    return err({
      type: 'invalid-sheet',
      subType: 'incompatible-interpretation-types',
      interpretationTypes: [front.type, back.type],
    });
  }

  // Check that the various pieces of metadata of the two pages match
  if (front.metadata.ballotStyleId !== back.metadata.ballotStyleId) {
    return err({
      type: 'invalid-sheet',
      subType: 'mismatched-ballot-style-ids',
      ballotStyleIds: [
        front.metadata.ballotStyleId,
        back.metadata.ballotStyleId,
      ],
    });
  }

  if (front.metadata.precinctId !== back.metadata.precinctId) {
    return err({
      type: 'invalid-sheet',
      subType: 'mismatched-precinct-ids',
      precinctIds: [front.metadata.precinctId, back.metadata.precinctId],
    });
  }

  if (front.metadata.ballotType !== back.metadata.ballotType) {
    return err({
      type: 'invalid-sheet',
      subType: 'mismatched-ballot-types',
      ballotTypes: [front.metadata.ballotType, back.metadata.ballotType],
    });
  }

  if (front.metadata.ballotHash !== back.metadata.ballotHash) {
    return err({
      type: 'invalid-sheet',
      subType: 'mismatched-ballot-hashes',
      ballotHashes: [front.metadata.ballotHash, back.metadata.ballotHash],
    });
  }

  // Valid and correctly oriented HMPB sheet
  if (front.metadata.pageNumber + 1 === back.metadata.pageNumber) {
    return ok({
      type: 'hmpb',
      interpretation: [front, back],
      filenames: [frontFilename, backFilename],
    });
  }

  // Valid and reverse oriented HMPB sheet
  if (back.metadata.pageNumber + 1 === front.metadata.pageNumber) {
    return ok({
      type: 'hmpb',
      interpretation: [back, front],
      filenames: [backFilename, frontFilename],
    });
  }

  return err({
    type: 'invalid-sheet',
    subType: 'non-consecutive-page-numbers',
    pageNumbers: [front.metadata.pageNumber, back.metadata.pageNumber],
  });
}

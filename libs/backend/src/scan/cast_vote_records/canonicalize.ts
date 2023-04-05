import {
  BallotLocale,
  BallotStyle,
  BallotType,
  ElectionDefinition,
  HmpbBallotPageMetadata,
  InterpretedBmdPage,
  InterpretedHmpbPage,
  PageInterpretation,
  Precinct,
  SheetOf,
} from '@votingworks/types';
import { throwIllegalValue, Result, ok, err } from '@votingworks/basics';

/**
 * The back of a BMD ballot should be empty, which could be interpreted as
 * either a blank or an unreadable page.
 */
const EMPTY_PAGE_TYPES: ReadonlyArray<PageInterpretation['type']> = [
  'BlankPage',
  'UnreadablePage',
];

/**
 * Enumeration representing possible sheet validation errors
 */
export enum SheetValidationErrorType {
  InvalidFrontBackPageTypes = 'InvalidFrontBackPageTypes',
  MismatchedBallotStyle = 'MismatchedBallotStyle',
  MismatchedBallotType = 'MismatchedBallotType',
  MismatchedElectionHash = 'MismatchedElectionHash',
  /**
   * @deprecated to be replaced (https://github.com/votingworks/roadmap/issues/15)
   */
  MismatchedLocales = 'MismatchedLocales',
  MismatchedPrecinct = 'MismatchedPrecinct',
  NonConsecutivePages = 'NonConsecutivePages',
}

/**
 * Type containing a validation error and information relevant to that error
 */
export type SheetValidationError =
  | {
      type: SheetValidationErrorType.NonConsecutivePages;
      pageNumbers: SheetOf<HmpbBallotPageMetadata['pageNumber']>;
    }
  | {
      type: SheetValidationErrorType.InvalidFrontBackPageTypes;
      types: SheetOf<PageInterpretation['type']>;
    }
  | {
      type: SheetValidationErrorType.MismatchedBallotStyle;
      ballotStyleIds: SheetOf<BallotStyle['id']>;
    }
  | {
      type: SheetValidationErrorType.MismatchedBallotType;
      ballotTypes: SheetOf<BallotType>;
    }
  | {
      type: SheetValidationErrorType.MismatchedElectionHash;
      electionHashes: SheetOf<ElectionDefinition['electionHash']>;
    }
  | {
      type: SheetValidationErrorType.MismatchedLocales;
      locales: SheetOf<BallotLocale>;
    }
  | {
      type: SheetValidationErrorType.MismatchedPrecinct;
      precinctIds: SheetOf<Precinct['id']>;
    };

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
      type: SheetValidationErrorType.InvalidFrontBackPageTypes,
      types: [front.type, back.type],
    });
  }

  // Check that the various pieces of metadata of the two pages match
  if (front.metadata.ballotStyleId !== back.metadata.ballotStyleId) {
    return err({
      type: SheetValidationErrorType.MismatchedBallotStyle,
      ballotStyleIds: [
        front.metadata.ballotStyleId,
        back.metadata.ballotStyleId,
      ],
    });
  }

  if (front.metadata.precinctId !== back.metadata.precinctId) {
    return err({
      type: SheetValidationErrorType.MismatchedPrecinct,
      precinctIds: [front.metadata.precinctId, back.metadata.precinctId],
    });
  }

  if (front.metadata.ballotType !== back.metadata.ballotType) {
    return err({
      type: SheetValidationErrorType.MismatchedBallotType,
      ballotTypes: [front.metadata.ballotType, back.metadata.ballotType],
    });
  }

  if (front.metadata.electionHash !== back.metadata.electionHash) {
    return err({
      type: SheetValidationErrorType.MismatchedElectionHash,
      electionHashes: [front.metadata.electionHash, back.metadata.electionHash],
    });
  }

  if (
    front.metadata.locales.primary !== back.metadata.locales.primary ||
    front.metadata.locales.secondary !== back.metadata.locales.secondary
  ) {
    return err({
      type: SheetValidationErrorType.MismatchedLocales,
      locales: [front.metadata.locales, back.metadata.locales],
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
    type: SheetValidationErrorType.NonConsecutivePages,
    pageNumbers: [front.metadata.pageNumber, back.metadata.pageNumber],
  });
}

/**
 * Provides a description of each sheet validation error.
 */
export function describeSheetValidationError(
  validationError: SheetValidationError
): string {
  switch (validationError.type) {
    case SheetValidationErrorType.InvalidFrontBackPageTypes: {
      const [front, back] = validationError.types;

      switch (front) {
        case 'InterpretedBmdPage':
          return `expected the back of a BMD page to be blank, but got '${back}'`;
        case 'InterpretedHmpbPage':
          return `expected the a HMPB page to be another HMPB page, but got '${back}'`;
        default:
          return `expected sheet to have a valid page type combination, but got front=${front} back=${back}`;
      }
    }

    case SheetValidationErrorType.MismatchedBallotStyle: {
      const [front, back] = validationError.ballotStyleIds;
      return `expected a sheet to have the same ballot style, but got front=${front} back=${back}`;
    }

    case SheetValidationErrorType.MismatchedBallotType: {
      const [front, back] = validationError.ballotTypes;
      return `expected a sheet to have the same ballot type, but got front=${BallotType[front]} back=${BallotType[back]}`;
    }

    case SheetValidationErrorType.MismatchedElectionHash: {
      const [front, back] = validationError.electionHashes;
      return `expected a sheet to have the same election hash, but got front=${front} back=${back}`;
    }

    case SheetValidationErrorType.MismatchedLocales: {
      const [front, back] = validationError.locales;
      return `expected a sheet to have the same locale, but got front=${
        front.primary
      }/${front.secondary ?? 'n/a'} back=${back.primary}/${
        back.secondary ?? 'n/a'
      }`;
    }

    case SheetValidationErrorType.MismatchedPrecinct: {
      const [front, back] = validationError.precinctIds;
      return `expected a sheet to have the same precinct, but got front=${front} back=${back}`;
    }

    case SheetValidationErrorType.NonConsecutivePages: {
      const [front, back] = validationError.pageNumbers;
      return `expected a sheet to have consecutive page numbers, but got front=${front} back=${back}`;
    }

    // istanbul ignore next
    default:
      throwIllegalValue(validationError);
  }
}

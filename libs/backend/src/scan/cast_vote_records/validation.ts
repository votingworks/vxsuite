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
 * Sheets with page interpretations of types outside this list can be excluded
 * immediately because they are either uninterpreted or already invalid.
 */
const VALID_PAGE_TYPES: ReadonlyArray<PageInterpretation['type']> = [
  ...EMPTY_PAGE_TYPES,
  'InterpretedBmdPage',
  'InterpretedHmpbPage',
];

/**
 * Enumeration representing possible sheet validation errors
 */
export enum SheetValidationErrorType {
  InvalidPageType = 'InvalidPageType',
  InvalidFrontBackPageTypes = 'InvalidFrontBackPageTypes',
  MismatchedBallotStyle = 'MismatchedBallotStyle',
  MismatchedBallotType = 'MismatchedBallotType',
  MismatchedElectionHash = 'MismatchedElectionHash',
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
    }
  | {
      type: SheetValidationErrorType.InvalidPageType;
      pageTypes: Array<PageInterpretation['type']>;
    };

/**
 * Result of a successful validation including the type of ballot and the
 * relevant interpretations. The interpretations in the `hmpb` type are always
 * in consecutive, [front, back] order. The `wasReversed` property indicates
 * whether the sheet passed to the validator was original in reverse order or not.
 */
export type ValidatedSheet =
  | {
      type: 'bmd';
      interpretation: InterpretedBmdPage;
    }
  | {
      type: 'hmpb';
      wasReversed: boolean;
      interpretation: SheetOf<InterpretedHmpbPage>;
    };

/**
 * Validates sheet interpretations
 */
export function validateSheetInterpretation([
  front,
  back,
]: SheetOf<PageInterpretation>): Result<ValidatedSheet, SheetValidationError> {
  if (
    !VALID_PAGE_TYPES.includes(front.type) ||
    !VALID_PAGE_TYPES.includes(back.type)
  ) {
    return err({
      type: SheetValidationErrorType.InvalidPageType,
      pageTypes: [front.type, back.type],
    });
  }

  // Valid and correctly oriented BMD sheet
  if (
    front.type === 'InterpretedBmdPage' &&
    EMPTY_PAGE_TYPES.includes(back.type)
  ) {
    return ok({
      type: 'bmd',
      interpretation: front,
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
      wasReversed: false,
      interpretation: [front, back],
    });
  }

  // Valid and reverse oriented HMPB sheet
  if (back.metadata.pageNumber + 1 === front.metadata.pageNumber) {
    return ok({
      type: 'hmpb',
      wasReversed: true,
      interpretation: [back, front],
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

    case SheetValidationErrorType.InvalidPageType: {
      return `unable to export sheet which contains at least one invalid page type: ${validationError.pageTypes.join(
        ', '
      )}`;
    }

    // istanbul ignore next
    default:
      throwIllegalValue(validationError);
  }
}

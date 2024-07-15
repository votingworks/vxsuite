import {
  BallotStyle,
  BallotType,
  ElectionDefinition,
  HmpbBallotPageMetadata,
  PageInterpretation,
  Precinct,
  SheetOf,
} from '@votingworks/types';
import { throwIllegalValue, Result, ok, err } from '@votingworks/basics';

const BlankPageTypes: ReadonlyArray<PageInterpretation['type']> = [
  'BlankPage',
  'UnreadablePage',
];

export enum ValidationErrorType {
  InvalidFrontBackPageTypes = 'InvalidFrontBackPageTypes',
  MismatchedBallotStyle = 'MismatchedBallotStyle',
  MismatchedBallotType = 'MismatchedBallotType',
  MismatchedElectionHash = 'MismatchedElectionHash',
  MismatchedPrecinct = 'MismatchedPrecinct',
  NonConsecutivePages = 'NonConsecutivePages',
}

export type ValidationError =
  | {
      type: ValidationErrorType.NonConsecutivePages;
      pageNumbers: SheetOf<HmpbBallotPageMetadata['pageNumber']>;
    }
  | {
      type: ValidationErrorType.InvalidFrontBackPageTypes;
      types: SheetOf<PageInterpretation['type']>;
    }
  | {
      type: ValidationErrorType.MismatchedBallotStyle;
      ballotStyleIds: SheetOf<BallotStyle['id']>;
    }
  | {
      type: ValidationErrorType.MismatchedBallotType;
      ballotTypes: SheetOf<BallotType>;
    }
  | {
      type: ValidationErrorType.MismatchedElectionHash;
      electionHashes: SheetOf<ElectionDefinition['ballotHash']>;
    }
  | {
      type: ValidationErrorType.MismatchedPrecinct;
      precinctIds: SheetOf<Precinct['id']>;
    };

export function validateSheetInterpretation([
  front,
  back,
]: SheetOf<PageInterpretation>): Result<void, ValidationError> {
  if (
    BlankPageTypes.includes(front.type) &&
    !BlankPageTypes.includes(back.type)
  ) {
    return validateSheetInterpretation([back, front]);
  }

  if (front.type === 'InterpretedBmdPage') {
    return BlankPageTypes.includes(back.type)
      ? ok(undefined)
      : err({
          type: ValidationErrorType.InvalidFrontBackPageTypes,
          types: [front.type, back.type],
        });
  }

  if (front.type === 'InterpretedHmpbPage') {
    if (back.type !== 'InterpretedHmpbPage') {
      return err({
        type: ValidationErrorType.InvalidFrontBackPageTypes,
        types: [front.type, back.type],
      });
    }

    if (front.metadata.pageNumber > back.metadata.pageNumber) {
      return validateSheetInterpretation([back, front]);
    }

    if (front.metadata.pageNumber + 1 !== back.metadata.pageNumber) {
      return err({
        type: ValidationErrorType.NonConsecutivePages,
        pageNumbers: [front.metadata.pageNumber, back.metadata.pageNumber],
      });
    }

    if (front.metadata.ballotStyleId !== back.metadata.ballotStyleId) {
      return err({
        type: ValidationErrorType.MismatchedBallotStyle,
        ballotStyleIds: [
          front.metadata.ballotStyleId,
          back.metadata.ballotStyleId,
        ],
      });
    }

    if (front.metadata.precinctId !== back.metadata.precinctId) {
      return err({
        type: ValidationErrorType.MismatchedPrecinct,
        precinctIds: [front.metadata.precinctId, back.metadata.precinctId],
      });
    }

    if (front.metadata.ballotType !== back.metadata.ballotType) {
      return err({
        type: ValidationErrorType.MismatchedBallotType,
        ballotTypes: [front.metadata.ballotType, back.metadata.ballotType],
      });
    }

    if (front.metadata.ballotHash !== back.metadata.ballotHash) {
      return err({
        type: ValidationErrorType.MismatchedElectionHash,
        electionHashes: [front.metadata.ballotHash, back.metadata.ballotHash],
      });
    }
  }

  return ok(undefined);
}

export function describeValidationError(
  validationError: ValidationError
): string {
  switch (validationError.type) {
    case ValidationErrorType.InvalidFrontBackPageTypes: {
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

    case ValidationErrorType.MismatchedBallotStyle: {
      const [front, back] = validationError.ballotStyleIds;
      return `expected a sheet to have the same ballot style, but got front=${front} back=${back}`;
    }

    case ValidationErrorType.MismatchedBallotType: {
      const [front, back] = validationError.ballotTypes;
      return `expected a sheet to have the same ballot type, but got front=${front} back=${back}`;
    }

    case ValidationErrorType.MismatchedElectionHash: {
      const [front, back] = validationError.electionHashes;
      return `expected a sheet to have the same election hash, but got front=${front} back=${back}`;
    }

    case ValidationErrorType.MismatchedPrecinct: {
      const [front, back] = validationError.precinctIds;
      return `expected a sheet to have the same precinct, but got front=${front} back=${back}`;
    }

    case ValidationErrorType.NonConsecutivePages: {
      const [front, back] = validationError.pageNumbers;
      return `expected a sheet to have consecutive page numbers, but got front=${front} back=${back}`;
    }

    default:
      throwIllegalValue(validationError);
  }
}

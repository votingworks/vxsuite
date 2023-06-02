import {
  CVR,
  CastVoteRecord,
  CastVoteRecordBallotType,
  ContestId,
  ContestOptionId,
} from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/basics';

/**
 * Gets all the write-in options from a list.
 */
export function getWriteInVotes(
  optionIds: ContestOptionId[]
): ContestOptionId[] {
  return optionIds.filter((id) => id.startsWith('write-in'));
}

/**
 * @deprecated Gets all the write-in options from a legacy CVR.
 */
export function deprecatedGetWriteInsFromCastVoteRecord(
  cvr: CastVoteRecord
): Map<ContestId, ContestOptionId[]> {
  const result = new Map<ContestId, ContestOptionId[]>();

  for (const [contestId, votes] of Object.entries(cvr)) {
    if (contestId.startsWith('_')) {
      continue;
    }

    if (Array.isArray(votes)) {
      result.set(contestId, getWriteInVotes(votes));
    }
  }

  return result;
}

/**
 * Converts the CDF ballot type into the legacy ballot type for tally code
 * consumers.
 */
export function cvrBallotTypeToLegacyBallotType(
  ballotType: CVR.vxBallotType
): CastVoteRecordBallotType {
  switch (ballotType) {
    case CVR.vxBallotType.Absentee:
      return 'absentee';
    case CVR.vxBallotType.Precinct:
      return 'standard';
    case CVR.vxBallotType.Provisional:
      return 'provisional';
    /* istanbul ignore next: compile-time check for completeness */
    default:
      throwIllegalValue(ballotType);
  }
}

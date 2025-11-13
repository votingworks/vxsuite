import { throwIllegalValue } from '@votingworks/basics';
import { SYSTEM_LIMITS, SystemLimitViolation } from '@votingworks/types';

/**
 * Converts a {@link SystemLimitViolation} to a human-readable string for use in an error message.
 */
export function systemLimitViolationToString(
  violation: SystemLimitViolation
): string {
  const { limitScope, limitType, valueExceedingLimit } = violation;
  const readableLimitType = (() => {
    switch (limitType) {
      case 'ballotStyles':
        return 'ballot styles';
      case 'candidates':
        return 'candidates';
      case 'candidatesSummedAcrossContests':
        return 'candidates summed across contests';
      case 'characters':
        return 'characters';
      case 'contests':
        return 'contests';
      case 'precincts':
        return 'precincts';
      case 'seats':
        return 'seats';
      case 'seatsSummedAcrossContests':
        return 'seats summed across contests';
      /* istanbul ignore next - @preserve */
      default:
        throwIllegalValue(limitType);
    }
  })();
  const readableLimitScope = (() => {
    switch (limitScope) {
      case 'contest':
        return `contest ${violation.contestId}`;
      case 'election':
        return 'election';
      case 'markScanBallotStyle':
        return `ballot style ${violation.ballotStyleId}`;
      case 'markScanContest':
        return `contest ${violation.contestId}`;
      case 'propositionTextField':
        return `proposition text field ${violation.fieldValue.slice(0, 49)}…`;
      case 'textField':
        return `text field ${violation.fieldValue.slice(0, 49)}…`;
      /* istanbul ignore next - @preserve */
      default:
        throwIllegalValue(limitScope);
    }
  })();
  const limitValue = (() => {
    switch (limitScope) {
      case 'contest':
        return SYSTEM_LIMITS.contest[limitType];
      case 'election':
        return SYSTEM_LIMITS.election[limitType];
      case 'markScanBallotStyle':
        return SYSTEM_LIMITS.markScanBallotStyle[limitType];
      case 'markScanContest':
        return SYSTEM_LIMITS.markScanContest[limitType];
      case 'propositionTextField':
        return SYSTEM_LIMITS.propositionTextField[limitType];
      case 'textField':
        return SYSTEM_LIMITS.textField[limitType];
      /* istanbul ignore next - @preserve */
      default:
        throwIllegalValue(limitScope);
    }
  })();
  const limitDesignation =
    limitScope === 'markScanBallotStyle' || limitScope === 'markScanContest'
      ? 'VxMarkScan system limit'
      : 'system limit';
  return (
    `Number of ${readableLimitType} in ${readableLimitScope} (${valueExceedingLimit}) ` +
    `exceeds ${limitDesignation} of ${limitValue}.`
  );
}

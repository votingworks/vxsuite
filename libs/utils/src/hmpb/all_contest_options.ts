import {
  assertDefined,
  throwIllegalValue,
  uniqueBy,
} from '@votingworks/basics';
import {
  AnyContest,
  BallotStyle,
  BallotStyleGroup,
  CandidateContest,
  CandidateContestOption,
  ContestOption,
  getOrderedCandidatesForContestInBallotStyle,
  YesNoContest,
  YesNoContestOption,
} from '@votingworks/types';

/**
 * Enumerates all contest options in the order they would appear on a HMPB.
 * For candidate contests, respects ballot style-specific candidate rotation, but simplifies multi-endorsed
 * candidates to the first appearance.
 */
export function allContestOptions(
  contest: CandidateContest,
  ballotStyle: BallotStyle | BallotStyleGroup
): Generator<CandidateContestOption>;
/**
 * Enumerates all contest options in the order they would appear on a HMPB.
 */
export function allContestOptions(
  contest: YesNoContest,
  ballotStyle?: BallotStyle | BallotStyleGroup
): Generator<YesNoContestOption>;
/**
 * Enumerates all contest options in the order they would appear on a HMPB.
 * For candidate contests, respects ballot style-specific candidate rotation.
 */
export function allContestOptions(
  contest: AnyContest,
  ballotStyle: BallotStyle | BallotStyleGroup
): Generator<ContestOption>;
/**
 * Enumerates all contest options in the order they would appear on a HMPB.
 * For candidate contests, respects ballot style-specific candidate rotation, but simplifies multi-endorsed
 * candidates to the first appearance.
 */
export function* allContestOptions(
  contest: AnyContest,
  ballotStyle?: BallotStyle | BallotStyleGroup
): Generator<ContestOption> {
  switch (contest.type) {
    case 'candidate': {
      // ballotStyle is guaranteed to be defined for CandidateContest by the function overload
      const orderedCandidates = uniqueBy(
        getOrderedCandidatesForContestInBallotStyle({
          contest,
          ballotStyle: assertDefined(ballotStyle),
        }),
        (candidate) => candidate.id
      );

      for (const candidate of orderedCandidates) {
        yield {
          type: 'candidate',
          id: candidate.id,
          contestId: contest.id,
          name: candidate.name,
          isWriteIn: false,
        };
      }

      if (contest.allowWriteIns) {
        for (let i = 0; i < contest.seats; i += 1) {
          yield {
            type: 'candidate',
            id: `write-in-${i}`,
            contestId: contest.id,
            name: 'Write-In',
            isWriteIn: true,
            writeInIndex: i,
          };
        }
      }
      break;
    }

    case 'yesno': {
      yield {
        type: 'yesno',
        id: contest.yesOption.id,
        contestId: contest.id,
        name: contest.yesOption.label,
      };
      yield {
        type: 'yesno',
        id: contest.noOption.id,
        contestId: contest.id,
        name: contest.noOption.label,
      };
      break;
    }

    /* istanbul ignore next */
    default:
      throwIllegalValue(contest, 'type');
  }
}

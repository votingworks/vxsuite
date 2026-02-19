import { throwIllegalValue, uniqueBy } from '@votingworks/basics';
import {
  AnyContest,
  BallotStyle,
  BallotStyleGroup,
  ContestOption,
  getOrderedCandidatesForContestInBallotStyle,
  Parties,
} from '@votingworks/types';

/**
 * Enumerates all contest options in the order they would appear on a HMPB,
 * including all instances of multi-endorsed candidates.
 * For candidate contests, respects ballot style-specific candidate rotation.
 */
export function* allContestOptionsWithMultiEndorsements(
  contest: AnyContest,
  ballotStyle: BallotStyle | BallotStyleGroup,
  parties: Parties
): Generator<ContestOption> {
  switch (contest.type) {
    case 'candidate': {
      const orderedCandidates = getOrderedCandidatesForContestInBallotStyle({
        contest,
        ballotStyle,
      });

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

    case 'straight-party': {
      for (const party of parties) {
        yield {
          type: 'straight-party',
          id: party.id,
          contestId: contest.id,
          name: party.fullName,
        };
      }
      break;
    }

    /* istanbul ignore next */
    default:
      throwIllegalValue(contest, 'type');
  }
}

/**
 * Enumerates all contest options in the order they would appear on a HMPB.
 * For candidate contests, respects ballot style-specific candidate rotation,
 * but simplifies multi-endorsed candidates to the first appearance.
 */
export function* allContestOptions(
  contest: AnyContest,
  ballotStyle: BallotStyle | BallotStyleGroup,
  parties: Parties
): Generator<ContestOption> {
  yield* uniqueBy(
    Array.from(allContestOptionsWithMultiEndorsements(contest, ballotStyle, parties)),
    (option) => option.id
  );
}

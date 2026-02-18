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
  Parties,
  StraightPartyContest,
  StraightPartyContestOption,
  YesNoContest,
  YesNoContestOption,
} from '@votingworks/types';

/**
 * Enumerates all contest options in the order they would appear on a HMPB,
 * including all instances of multi-endorsed candidates.
 * For candidate contests, respects ballot style-specific candidate rotation.
 */
export function allContestOptionsWithMultiEndorsements(
  contest: CandidateContest,
  ballotStyle: BallotStyle | BallotStyleGroup,
  parties?: Parties
): Generator<CandidateContestOption>;
/**
 * Enumerates all contest options in the order they would appear on a HMPB.
 */
export function allContestOptionsWithMultiEndorsements(
  contest: YesNoContest,
  ballotStyle?: BallotStyle | BallotStyleGroup,
  parties?: Parties
): Generator<YesNoContestOption>;
/**
 * Enumerates all contest options in the order they would appear on a HMPB.
 * For straight-party contests, yields one option per party.
 */
export function allContestOptionsWithMultiEndorsements(
  contest: StraightPartyContest,
  ballotStyle: BallotStyle | BallotStyleGroup | undefined,
  parties: Parties
): Generator<StraightPartyContestOption>;
/**
 * Enumerates all contest options in the order they would appear on a HMPB,
 * including all instances of multi-endorsed candidates.
 * For candidate contests, respects ballot style-specific candidate rotation.
 */
export function allContestOptionsWithMultiEndorsements(
  contest: AnyContest,
  ballotStyle: BallotStyle | BallotStyleGroup,
  parties?: Parties
): Generator<ContestOption>;
/**
 * Enumerates all contest options in the order they would appear on a HMPB,
 * including all instances of multi-endorsed candidates.
 * For candidate contests, respects ballot style-specific candidate rotation.
 */
export function* allContestOptionsWithMultiEndorsements(
  contest: AnyContest,
  ballotStyle?: BallotStyle | BallotStyleGroup,
  parties?: Parties
): Generator<ContestOption> {
  switch (contest.type) {
    case 'candidate': {
      // ballotStyle is guaranteed to be defined for CandidateContest by the function overload
      const orderedCandidates = getOrderedCandidatesForContestInBallotStyle({
        contest,
        ballotStyle: assertDefined(ballotStyle),
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
      const resolvedParties = assertDefined(
        parties,
        'parties required for straight-party contest'
      );
      for (const party of resolvedParties) {
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
 * For candidate contests, respects ballot style-specific candidate rotation, but simplifies multi-endorsed
 * candidates to the first appearance.
 */
export function allContestOptions(
  contest: CandidateContest,
  ballotStyle: BallotStyle | BallotStyleGroup,
  parties?: Parties
): Generator<CandidateContestOption>;
/**
 * Enumerates all contest options in the order they would appear on a HMPB.
 */
export function allContestOptions(
  contest: YesNoContest,
  ballotStyle?: BallotStyle | BallotStyleGroup,
  parties?: Parties
): Generator<YesNoContestOption>;
/**
 * Enumerates all contest options in the order they would appear on a HMPB.
 * For straight-party contests, yields one option per party.
 */
export function allContestOptions(
  contest: StraightPartyContest,
  ballotStyle: BallotStyle | BallotStyleGroup | undefined,
  parties: Parties
): Generator<StraightPartyContestOption>;
/**
 * Enumerates all contest options in the order they would appear on a HMPB.
 * For candidate contests, respects ballot style-specific candidate rotation.
 */
export function allContestOptions(
  contest: AnyContest,
  ballotStyle: BallotStyle | BallotStyleGroup,
  parties?: Parties
): Generator<ContestOption>;
/**
 * Enumerates all contest options in the order they would appear on a HMPB.
 * For candidate contests, respects ballot style-specific candidate rotation, but simplifies multi-endorsed
 * candidates to the first appearance.
 */
export function* allContestOptions(
  contest: AnyContest,
  ballotStyle?: BallotStyle | BallotStyleGroup,
  parties?: Parties
): Generator<ContestOption> {
  // Get all options including multi-endorsed duplicates, then de-duplicate by id
  yield* uniqueBy(
    Array.from(
      allContestOptionsWithMultiEndorsements(
        contest,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        ballotStyle!,
        parties
      )
    ),
    (option) => option.id
  );
}

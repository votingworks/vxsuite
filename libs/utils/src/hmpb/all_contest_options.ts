import {
  assert,
  assertDefined,
  find,
  throwIllegalValue,
  uniqueBy,
} from '@votingworks/basics';
import {
  Contest,
  BallotStyle,
  BallotStyleGroup,
  CandidateContest,
  CandidateContestOption,
  ContestOption,
  getOrderedCandidatesForContestInBallotStyle,
  straightPartyNotYetImplemented,
  YesNoContest,
  YesNoContestOption,
  StraightPartyContest,
  StraightPartyContestOption,
} from '@votingworks/types';

/**
 * Enumerates all contest options in the order they would appear on a HMPB,
 * including all instances of multi-endorsed candidates.
 * For candidate contests, respects ballot style-specific candidate rotation.
 */
export function allContestOptionsWithMultiEndorsements(
  contest: CandidateContest,
  ballotStyle: BallotStyle | BallotStyleGroup
): Generator<CandidateContestOption>;
/**
 * Enumerates all contest options in the order they would appear on a HMPB.
 */
export function allContestOptionsWithMultiEndorsements(
  contest: YesNoContest,
  ballotStyle?: BallotStyle | BallotStyleGroup
): Generator<YesNoContestOption>;
/**
 * Enumerates all contest options in the order they would appear on a HMPB.
 */
export function allContestOptionsWithMultiEndorsements(
  contest: StraightPartyContest,
  ballotStyle?: BallotStyle | BallotStyleGroup
): Generator<StraightPartyContestOption>;
/**
 * Enumerates all contest options in the order they would appear on a HMPB,
 * including all instances of multi-endorsed candidates.
 * For candidate contests, respects ballot style-specific candidate rotation.
 */
export function allContestOptionsWithMultiEndorsements(
  contest: Contest,
  ballotStyle: BallotStyle | BallotStyleGroup
): Generator<ContestOption>;
/**
 * Enumerates all contest options in the order they would appear on a HMPB,
 * including all instances of multi-endorsed candidates.
 * For candidate contests, respects ballot style-specific candidate rotation.
 */
export function* allContestOptionsWithMultiEndorsements(
  contest: Contest,
  ballotStyle?: BallotStyle | BallotStyleGroup
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
          isWriteIn: false,
        };
      }

      if (contest.allowWriteIns) {
        for (let i = 0; i < contest.seats; i += 1) {
          yield {
            type: 'candidate',
            id: `write-in-${i}`,
            contestId: contest.id,
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
      };
      yield {
        type: 'yesno',
        id: contest.noOption.id,
        contestId: contest.id,
      };
      break;
    }

    case 'straight-party': {
      for (const partyId of contest.optionIds) {
        yield {
          type: 'straight-party',
          id: partyId,
          contestId: contest.id,
        };
      }
      break;
    }

    default:
      /* istanbul ignore next */
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
 */
export function allContestOptions(
  contest: StraightPartyContest,
  ballotStyle?: BallotStyle | BallotStyleGroup
): Generator<StraightPartyContestOption>;
/**
 * Enumerates all contest options in the order they would appear on a HMPB.
 * For candidate contests, respects ballot style-specific candidate rotation.
 */
export function allContestOptions(
  contest: Contest,
  ballotStyle: BallotStyle | BallotStyleGroup
): Generator<ContestOption>;
/**
 * Enumerates all contest options in the order they would appear on a HMPB.
 * For candidate contests, respects ballot style-specific candidate rotation, but simplifies multi-endorsed
 * candidates to the first appearance.
 */
export function* allContestOptions(
  contest: Contest,
  ballotStyle?: BallotStyle | BallotStyleGroup
): Generator<ContestOption> {
  // Get all options including multi-endorsed duplicates, then de-duplicate by id
  yield* uniqueBy(
    Array.from(
      allContestOptionsWithMultiEndorsements(
        contest,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        ballotStyle!
      )
    ),
    (option) => option.id
  );
}

/**
 * Given a {@link ContestOption}, returns the display name for that option based on the contest definition.
 */
export function contestOptionName(
  contest: Contest,
  option: ContestOption
): string {
  /* istanbul ignore next */
  if (option.type === 'straight-party') {
    return straightPartyNotYetImplemented();
  }
  switch (option.type) {
    case 'candidate': {
      assert(contest.type === 'candidate');
      return option.isWriteIn
        ? 'Write-In'
        : find(contest.candidates, (c) => c.id === option.id).name;
    }
    case 'yesno': {
      assert(contest.type === 'yesno');
      return find(
        [contest.yesOption, contest.noOption],
        (o) => o.id === option.id
      ).label;
    }
    default:
      /* istanbul ignore next */
      throwIllegalValue(option);
  }
}

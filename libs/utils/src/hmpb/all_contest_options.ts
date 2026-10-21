import { assert, find, throwIllegalValue } from '@votingworks/basics';
import {
  type Contest,
  type CandidateContest,
  type CandidateContestOption,
  type ContestOption,
  getOrderedCandidates,
  type YesNoContest,
  type YesNoContestOption,
  type StraightPartyContest,
  type StraightPartyContestOption,
  type Election,
  type OptionalCandidateOrderings,
} from '@votingworks/types';

export const WRITE_IN_ID_PREFIX = 'write-in-';

/**
 * All straight-party contest options, in the order they would appear on a HMPB.
 */
export function* allStraightPartyOptions(
  contest: StraightPartyContest
): Generator<StraightPartyContestOption> {
  for (const id of contest.optionIds) {
    yield { type: 'straight-party', id, contestId: contest.id };
  }
}

/**
 * All ballot measure options, in the order they would appear on a HMPB.
 */
export function* allYesNoOptions(
  contest: YesNoContest
): Generator<YesNoContestOption> {
  for (const { id } of contest.options) {
    yield { type: 'yesno', id, contestId: contest.id };
  }
}

/**
 * All unique candidate contest options, in the order they would appear on a
 * HMPB.
 *
 * Respects ballot style-specific candidate rotation, but simplifies
 * multi-endorsed candidates to the first appearance.
 */
export function* uniqueCandidateOptions(
  contest: CandidateContest,
  orderings: OptionalCandidateOrderings
): Generator<CandidateContestOption> {
  const seenIds = new Set<string>();
  for (const { id } of getOrderedCandidates({ contest, orderings })) {
    if (seenIds.has(id)) continue;

    seenIds.add(id);
    yield { type: 'candidate', id, contestId: contest.id, isWriteIn: false };
  }

  if (!contest.allowWriteIns) return;

  for (let i = 0; i < contest.seats; i += 1) {
    yield {
      type: 'candidate',
      id: `${WRITE_IN_ID_PREFIX}${i}`,
      contestId: contest.id,
      isWriteIn: true,
      writeInIndex: i,
    };
  }
}

/**
 * Enumerates all contest options in the order they would appear on a HMPB.
 * For candidate contests, respects ballot style-specific candidate rotation, but simplifies multi-endorsed
 * candidates to the first appearance.
 */
export function* uniqueContestOptions(
  contest: Contest,
  candidateOrderings: OptionalCandidateOrderings
): Generator<ContestOption> {
  switch (contest.type) {
    case 'candidate':
      return yield* uniqueCandidateOptions(contest, candidateOrderings);

    case 'yesno':
      return yield* allYesNoOptions(contest);

    case 'straight-party':
      return yield* allStraightPartyOptions(contest);

    default:
      throwIllegalValue(contest, 'type');
  }
}

/**
 * Given a {@link ContestOption}, returns the display name for that option based on the contest definition.
 */
export function contestOptionName(
  election: Pick<Election, 'parties'>,
  contest: Contest,
  option: ContestOption
): string {
  switch (option.type) {
    case 'candidate': {
      assert(contest.type === 'candidate');
      return option.isWriteIn
        ? 'Write-In'
        : find(contest.candidates, (c) => c.id === option.id).name;
    }
    case 'yesno': {
      assert(contest.type === 'yesno');
      return find(contest.options, (o) => o.id === option.id).label;
    }
    case 'straight-party': {
      assert(contest.type === 'straight-party');
      return find(election.parties, (p) => p.id === option.id).fullName;
    }
    default:
      throwIllegalValue(option);
  }
}

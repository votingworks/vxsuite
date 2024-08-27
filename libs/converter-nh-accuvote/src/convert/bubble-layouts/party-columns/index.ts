import { TemplateGridAndBubbles } from '@votingworks/ballot-interpreter';
import { Optional, Result, err, iter, ok } from '@votingworks/basics';
import { asSheet } from '@votingworks/types';
import { inspect } from 'util';
import { AvsInterface } from '../../accuvote';
import { newBallotGridPoint } from '../../coordinates';
import {
  AnyUnmatched,
  MatchBubblesResult,
  MatchedCandidate,
  UnmatchedBubble,
  UnmatchedCandidate,
} from '../../types';
import { matchBubblesAndYesNoContestOptions } from '../match_bubbles_and_yes_no_contest_options';

/**
 * Orders the parties in the definition by the order they appear in the contests.
 * It may be that some parties are not represented in all contests, so the first
 * candidate in a contest does not necessarily belong to the first party.
 */
function orderParties(definition: AvsInterface): Array<Optional<string>> {
  const partiesBeforeParty = new Map<Optional<string>, Set<Optional<string>>>();

  for (const contest of definition.candidates) {
    for (const [i, candidate] of contest.candidateNames.entries()) {
      const parties = partiesBeforeParty.get(candidate.party) ?? new Set();
      partiesBeforeParty.set(candidate.party, parties);

      for (const earlierCandidate of iter(contest.candidateNames).take(i)) {
        parties.add(earlierCandidate.party);
      }
    }
  }

  // topological sort of the parties
  const orderedParties: Array<Optional<string>> = [];
  const visitedParties = new Set<Optional<string>>();

  function visitParty(party?: string) {
    if (visitedParties.has(party)) {
      return;
    }
    visitedParties.add(party);

    const partiesBefore = partiesBeforeParty.get(party) ?? new Set();
    for (const partyBefore of partiesBefore) {
      visitParty(partyBefore);
    }

    orderedParties.push(party);
  }

  for (const party of partiesBeforeParty.keys()) {
    visitParty(party);
  }

  return orderedParties;
}

/**
 * Matches unmatched bubbles and candidates by grouping bubbles into columns and
 * matching them to candidates based on the ordering of contests and candidates.
 */
function matchBubblesAndCandidates({
  definition,
  unmatched,
}: {
  definition: AvsInterface;
  unmatched: AnyUnmatched[];
}): MatchBubblesResult {
  const orderedParties = orderParties(definition);
  const unmatchedBubblesByColumnThenRow = unmatched
    .filter((u): u is UnmatchedBubble => u.type === 'bubble')
    .sort((a, b) =>
      a.bubble.x === b.bubble.x
        ? a.side === b.side
          ? a.bubble.y - b.bubble.y
          : a.side === 'front'
          ? -1
          : 1
        : a.bubble.x - b.bubble.x
    );

  const unmatchedCandidatesSortedByPartyThenContest: UnmatchedCandidate[] = [];

  for (const party of orderedParties) {
    for (const contest of definition.candidates) {
      for (const candidate of contest.candidateNames) {
        if (candidate.party === party) {
          const unmatchedCandidate = unmatched.find(
            (u): u is UnmatchedCandidate =>
              u.type === 'candidate' &&
              u.office === contest.officeName &&
              u.candidate === candidate
          );
          if (!unmatchedCandidate) {
            return { matched: [[], []], unmatched };
          }
          unmatchedCandidatesSortedByPartyThenContest.push(unmatchedCandidate);
        }
      }
    }
  }

  if (
    unmatchedCandidatesSortedByPartyThenContest.length !==
    unmatchedBubblesByColumnThenRow.length
  ) {
    return { matched: [[], []], unmatched };
  }

  const frontMatches: MatchedCandidate[] = [];
  const backMatches: MatchedCandidate[] = [];

  for (const [unmatchedCandidate, unmatchedBubble] of iter(
    unmatchedCandidatesSortedByPartyThenContest
  ).zip(unmatchedBubblesByColumnThenRow)) {
    const matches =
      unmatchedBubble.side === 'front' ? frontMatches : backMatches;
    matches.push({
      type: 'candidate',
      office: unmatchedCandidate.office,
      candidate: unmatchedCandidate.candidate,
      bubble: newBallotGridPoint(
        unmatchedBubble.bubble.x,
        unmatchedBubble.bubble.y
      ),
    });
  }

  return { matched: [frontMatches, backMatches], unmatched: [] };
}

/**
 * Matches bubbles according to the `BubbleLayout.PartyColumns` layout.
 */
export function matchBubblesAndContestOptionsUsingPartyColumns({
  definition,
  gridsAndBubbles,
}: {
  definition: AvsInterface;
  gridsAndBubbles: TemplateGridAndBubbles;
}): Result<MatchBubblesResult, Error> {
  const yesNoContestOptionMatchResult = matchBubblesAndYesNoContestOptions({
    definition,
    gridsAndBubbles,
  });

  const [yesNoUnmatched, remainingUnmatched] = iter(
    yesNoContestOptionMatchResult.unmatched
  ).partition((u) => u.type === 'yesno' || u.type === 'hacky-question');

  if (yesNoUnmatched.length) {
    return err(new Error(`Unexpected unmatched: ${inspect(yesNoUnmatched)}`));
  }

  const candidateMatchResult = matchBubblesAndCandidates({
    definition,
    unmatched: remainingUnmatched,
  });

  return ok({
    matched: asSheet(
      iter(candidateMatchResult.matched)
        .zip(yesNoContestOptionMatchResult.matched)
        .map(([candidates, yesNo]) => [...candidates, ...yesNo])
        .toArray()
    ),
    unmatched: candidateMatchResult.unmatched,
  });
}

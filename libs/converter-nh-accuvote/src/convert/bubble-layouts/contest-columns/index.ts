import { TemplateGridAndBubbles } from '@votingworks/ballot-interpreter';
import { Result, err, iter, ok } from '@votingworks/basics';
import { asSheet } from '@votingworks/types';
import { inspect } from 'util';
import { AvsInterface } from '../../accuvote';
import {
  AnyUnmatched,
  MatchBubblesResult,
  MatchedCandidate,
  UnmatchedBubble,
  UnmatchedCandidate,
} from '../../types';
import { matchBubblesAndYesNoContestOptions } from '../match_bubbles_and_yes_no_contest_options';

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
  const unmatchedBubblesBySideThenColumnThenRow = unmatched
    .filter((u): u is UnmatchedBubble => u.type === 'bubble')
    .sort((a, b) =>
      a.side === b.side
        ? a.bubble.x === b.bubble.x
          ? a.bubble.y - b.bubble.y
          : a.bubble.x - b.bubble.x
        : a.side === 'front'
        ? -1
        : 1
    );

  const unmatchedCandidatesInDefinitionOrder: UnmatchedCandidate[] = [];

  for (const contest of definition.candidates) {
    for (const candidate of contest.candidateNames) {
      const unmatchedCandidate = unmatched.find(
        (u): u is UnmatchedCandidate =>
          u.type === 'candidate' && u.candidate === candidate
      );
      if (!unmatchedCandidate) {
        return { matched: [[], []], unmatched };
      }
      unmatchedCandidatesInDefinitionOrder.push(unmatchedCandidate);
    }
  }

  if (
    unmatchedCandidatesInDefinitionOrder.length !==
    unmatchedBubblesBySideThenColumnThenRow.length
  ) {
    return { matched: [[], []], unmatched };
  }

  const frontMatches: MatchedCandidate[] = [];
  const backMatches: MatchedCandidate[] = [];

  for (const [unmatchedCandidate, unmatchedBubble] of iter(
    unmatchedCandidatesInDefinitionOrder
  ).zip(unmatchedBubblesBySideThenColumnThenRow)) {
    const matchesForSide =
      unmatchedBubble.side === 'front' ? frontMatches : backMatches;
    matchesForSide.push({
      type: 'candidate',
      office: unmatchedCandidate.office,
      candidate: unmatchedCandidate.candidate,
      bubble: unmatchedBubble.bubble,
    });
  }

  return { matched: [frontMatches, backMatches], unmatched: [] };
}

/**
 * Matches bubbles according to the `BubbleLayout.ContestColumns` layout.
 */
export function matchBubblesAndContestOptionsUsingContestColumns({
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

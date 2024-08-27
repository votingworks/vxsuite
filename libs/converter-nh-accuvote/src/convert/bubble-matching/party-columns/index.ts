import { TemplateGridAndBubbles } from '@votingworks/ballot-interpreter';
import {
  Optional,
  Result,
  assert,
  assertDefined,
  err,
  iter,
  ok,
} from '@votingworks/basics';
import { SheetOf } from '@votingworks/types';
import { inspect } from 'util';
import { AvsInterface } from '../../accuvote';
import { newBallotGridPoint } from '../../coordinates';
import { parseConstitutionalQuestions } from '../../parse_constitutional_questions';
import {
  AnyMatched,
  AnyUnmatched,
  GridEntry,
  MatchBubblesResult,
  MatchedCandidate,
  UnmatchedBubble,
  UnmatchedCandidate,
  UnmatchedHackyParsedConstitutionalQuestion,
  UnmatchedYesNoQuestionOption,
} from '../../types';
import { bySideThenRow } from '../spacial-mapping/ordering';

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
 * Matches bubbles to yes/no contest options using the detected positions of the
 * bubbles and the ordering of contests. Assumes that yes/no contests are at the
 * end of the contests.
 */
function matchBubblesAndYesNoContestOptions({
  definition,
  gridsAndBubbles,
}: {
  definition: AvsInterface;
  gridsAndBubbles: TemplateGridAndBubbles;
}): MatchBubblesResult {
  const matched: SheetOf<AnyMatched[]> = [[], []];

  const parseQuestionsResult = definition.ballotPaperInfo
    ? parseConstitutionalQuestions(definition.ballotPaperInfo.questions)
    : undefined;

  const parsedQuestions = parseQuestionsResult?.unsafeUnwrap();

  assert(
    !(
      (parsedQuestions?.questions.length ?? 0) > 0 &&
      definition.yesNoQuestions.length > 0
    ),
    'Cannot have both parsed HTML and defined yes/no questions because we cannot order them properly'
  );

  let unmatched: AnyUnmatched[] = [
    ...iter(gridsAndBubbles)
      .zip(['front', 'back'] as const)
      .flatMap(([{ bubbles }, side]) =>
        bubbles.map(
          (bubble): UnmatchedBubble => ({
            type: 'bubble',
            side,
            bubble: newBallotGridPoint(bubble.x, bubble.y),
          })
        )
      ),
    ...definition.candidates.flatMap((contest) =>
      contest.candidateNames.map(
        (candidate): UnmatchedCandidate => ({
          type: 'candidate',
          office: contest.officeName,
          candidate,
        })
      )
    ),
    ...definition.yesNoQuestions.flatMap(
      (contest): UnmatchedYesNoQuestionOption[] => [
        {
          type: 'yesno',
          question: contest,
          option: 'yes',
        },
        {
          type: 'yesno',
          question: contest,
          option: 'no',
        },
      ]
    ),
    ...(parsedQuestions?.questions ?? []).flatMap(
      (question): UnmatchedHackyParsedConstitutionalQuestion => ({
        type: 'hacky-question',
        question,
      })
    ),
  ];
  const bubblesGroupedByRow = iter(
    iter(gridsAndBubbles)
      .zip(['front', 'back'] as const)
      .flatMap(([{ bubbles }, side]) =>
        bubbles.map(
          (bubble): GridEntry => ({ side, column: bubble.x, row: bubble.y })
        )
      )
      .toArray()
      .sort(bySideThenRow)
  )
    .groupBy((a, b) => a.side === b.side && a.row === b.row)
    .toArray();

  for (const contest of definition.yesNoQuestions) {
    const row = bubblesGroupedByRow.pop();
    if (!row || row.length !== 2) {
      break;
    }

    unmatched = unmatched.filter(
      (u) => u.type !== 'yesno' || u.question !== contest
    );

    const yesBubble = assertDefined(
      [...row].sort((a, b) => a.column - b.column)[0]
    );
    const matchedForSide = matched[yesBubble.side === 'front' ? 0 : 1];

    for (const bubble of row) {
      matchedForSide.push({
        type: 'yesno',
        question: contest,
        option: bubble === yesBubble ? 'yes' : 'no',
        bubble: newBallotGridPoint(bubble.column, bubble.row),
      });
      unmatched = unmatched.filter(
        (u) =>
          !(
            u.type === 'bubble' &&
            u.side === bubble.side &&
            u.bubble.x === bubble.column &&
            u.bubble.y === bubble.row
          )
      );
    }
  }

  for (const question of parsedQuestions?.questions ?? []) {
    const row = bubblesGroupedByRow.pop();
    if (!row || row.length !== 2) {
      break;
    }
    unmatched = unmatched.filter(
      (u) => u.type !== 'hacky-question' || u.question !== question
    );

    const [yesBubble, noBubble] = [...row].sort((a, b) => a.column - b.column);
    assert(yesBubble && noBubble);

    const { side } = yesBubble;
    const matches = side === 'front' ? matched[0] : matched[1];

    matches.push({
      type: 'hacky-question',
      question,
      yesBubble: newBallotGridPoint(yesBubble.column, yesBubble.row),
      noBubble: newBallotGridPoint(noBubble.column, noBubble.row),
    });

    for (const bubble of row) {
      unmatched = unmatched.filter(
        (u) =>
          !(
            u.type === 'bubble' &&
            u.side === bubble.side &&
            u.bubble.x === bubble.column &&
            u.bubble.y === bubble.row
          )
      );
    }
  }

  return { matched, unmatched };
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
 * Matches bubbles to contest options using the detected positions of the
 * bubbles and the ordering of contests and candidates such that candidates from
 * a party are all stacked in the same column.
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

  return ok(candidateMatchResult);
}

import { TemplateGridAndBubbles } from '@votingworks/ballot-interpreter';
import { assert, assertDefined, iter } from '@votingworks/basics';
import { SheetOf } from '@votingworks/types';
import { AvsInterface } from '../accuvote';
import { newBallotGridPoint } from '../coordinates';
import { parseConstitutionalQuestions } from '../parse_constitutional_questions';
import {
  AnyMatched,
  AnyUnmatched,
  GridEntry,
  MatchBubblesResult,
  UnmatchedBubble,
  UnmatchedCandidate,
  UnmatchedHackyParsedConstitutionalQuestion,
  UnmatchedYesNoQuestionOption,
} from '../types';
import { bySideThenRow } from './relative-spacial/ordering';

/**
 * Matches bubbles to yes/no contest options using the detected positions of the
 * bubbles and the ordering of contests. Assumes that yes/no contests are at the
 * end of the contests.
 */
export function matchBubblesAndYesNoContestOptions({
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

  // Note: Similar patch should be applied to the loop above, just not relevant for the current
  // batch of XMLs
  const questions = parsedQuestions?.questions ?? [];
  const lastRows = bubblesGroupedByRow.slice(-1 * questions.length);
  for (const [i, question] of questions.entries()) {
    const row = lastRows[i];
    if (!row || row.length !== 2) {
      break;
    }
    unmatched = unmatched.filter(
      (u) => !(u.type === 'hacky-question' && u.question === question)
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

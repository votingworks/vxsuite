import { TemplateGridAndBubbles } from '@votingworks/ballot-interpreter';
import {
  Result,
  assert,
  err,
  iter,
  ok,
  throwIllegalValue,
} from '@votingworks/basics';
import { inspect } from 'util';
import { AvsInterface } from '../../accuvote';
import { newBallotGridPoint } from '../../coordinates';
import { parseConstitutionalQuestions } from '../../parse_constitutional_questions';
import {
  AnyMatched,
  AnyUnmatched,
  MatchBubblesResult,
  TemplateBubbleGridEntry,
} from '../../types';
import { bySideThenRow } from './ordering';
import { pairColumnEntries } from './pair_column_entries';
import {
  AnyGridEntry,
  readGridFromElectionDefinition,
} from './read_grid_from_election_definition';

type AnyGridEntryWithFalseSide = AnyGridEntry & {
  side: 'front';
};

/**
 * Matches bubbles to contest options using the detected positions of the bubbles and
 * the declared positions of the candidates from the AccuVote definition.
 */
export function matchBubblesAndContestOptionsUsingSpacialMapping({
  definition,
  gridsAndBubbles,
}: {
  definition: AvsInterface;
  gridsAndBubbles: TemplateGridAndBubbles;
}): Result<MatchBubblesResult, Error> {
  const [frontGridAndBubbles, backGridAndBubbles] = gridsAndBubbles;
  const frontMatches: AnyMatched[] = [];
  const backMatches: AnyMatched[] = [];

  const bubbleGrid = [
    ...frontGridAndBubbles.bubbles.map<TemplateBubbleGridEntry>((bubble) => ({
      side: 'front',
      column: bubble.x,
      row: bubble.y,
    })),
    ...backGridAndBubbles.bubbles.map<TemplateBubbleGridEntry>((bubble) => ({
      side: 'back',
      column: bubble.x,
      row: bubble.y,
    })),
  ];

  const constitutionalQuestionRows: Array<TemplateBubbleGridEntry[]> = [];

  const parseQuestionsResult = definition.ballotPaperInfo
    ? parseConstitutionalQuestions(definition.ballotPaperInfo.questions)
    : undefined;

  if (parseQuestionsResult?.isErr()) {
    return err(
      new Error(
        `Failed to parse constitutional questions: ${inspect(
          parseQuestionsResult.err()
        )}`
      )
    );
  }

  const questions = parseQuestionsResult?.ok();
  if (questions?.questions.length) {
    const bubblesByRowTopToBottom = iter(bubbleGrid.slice().sort(bySideThenRow))
      .groupBy((a, b) => a.side === b.side && a.row === b.row)
      .toArray();

    for (const question of questions.questions) {
      const row = bubblesByRowTopToBottom.pop();
      if (row?.length !== 2) {
        return err(
          new Error(
            `Expected two bubbles per row for each constitutional question, got ${row?.length}: ${inspect(
              row
            )}`
          )
        );
      }
      constitutionalQuestionRows.push(row);
      const [yesBubble, noBubble] = [...row].sort(
        (a, b) => a.column - b.column
      );
      assert(yesBubble && noBubble);

      const { side } = yesBubble;
      const matches = side === 'front' ? frontMatches : backMatches;

      matches.push({
        type: 'hacky-question',
        question,
        yesBubble: newBallotGridPoint(yesBubble.column, yesBubble.row),
        noBubble: newBallotGridPoint(noBubble.column, noBubble.row),
      });
    }
  }

  const bubbleGridWithoutConstitutionalQuestions = bubbleGrid.filter(
    (bubble) =>
      !constitutionalQuestionRows.some((row) =>
        row.some(
          (b) =>
            b.side === bubble.side &&
            b.row === bubble.row &&
            b.column === bubble.column
        )
      )
  );
  const gridEntries = readGridFromElectionDefinition(definition);

  const pairColumnEntriesResult = pairColumnEntries(
    gridEntries.map(
      (entry): AnyGridEntryWithFalseSide => ({
        ...entry,
        side: 'front',
      })
    ),
    bubbleGridWithoutConstitutionalQuestions
  );

  const pairs = pairColumnEntriesResult.isOk()
    ? pairColumnEntriesResult.ok().pairs
    : pairColumnEntriesResult.err().pairs;
  const [frontBubbles, backBubbles] = iter(
    bubbleGridWithoutConstitutionalQuestions
  ).partition(({ side }) => side === 'front');

  for (const [gridEntry, bubble] of pairs) {
    const { side } = bubble;
    const matches = side === 'front' ? frontMatches : backMatches;

    switch (gridEntry.type) {
      case 'candidate':
        matches.push({
          type: 'candidate',
          office: gridEntry.office,
          candidate: gridEntry.candidate,
          bubble: newBallotGridPoint(bubble.column, bubble.row),
        });
        break;

      case 'yesno':
        matches.push({
          type: 'yesno',
          question: gridEntry.question,
          option: gridEntry.option,
          bubble: newBallotGridPoint(bubble.column, bubble.row),
        });
        break;

      default:
        throwIllegalValue(gridEntry, 'type');
    }
  }

  const unmatched: AnyUnmatched[] = [];

  for (const [matches, allBubbles, side] of [
    [frontMatches, frontBubbles, 'front'],
    [backMatches, backBubbles, 'back'],
  ] as const) {
    for (const bubble of allBubbles) {
      if (bubble.side !== side) {
        continue;
      }

      // eslint-disable-next-line array-callback-return
      const matchesForBubble = matches.filter((match) => {
        switch (match.type) {
          case 'candidate':
          case 'yesno':
            return (
              match.bubble.x === bubble.column && match.bubble.y === bubble.row
            );

          case 'hacky-question':
            return (
              (match.yesBubble.x === bubble.column &&
                match.yesBubble.y === bubble.row) ||
              (match.noBubble.x === bubble.column &&
                match.noBubble.y === bubble.row)
            );

          default:
            throwIllegalValue(match, 'type');
        }
      });
      assert(
        matchesForBubble.length <= 1,
        `Multiple matches for bubble: ${inspect(matchesForBubble)}`
      );

      if (matchesForBubble.length === 0) {
        const ballotGridPoint = newBallotGridPoint(bubble.column, bubble.row);
        unmatched.push({
          type: 'bubble',
          side,
          bubble: ballotGridPoint,
        });
      }
    }
  }

  for (const gridEntry of gridEntries) {
    const gridEntryIsMatched = [frontMatches, backMatches].some((matches) =>
      // eslint-disable-next-line array-callback-return
      matches.some((match) => {
        switch (gridEntry.type) {
          case 'candidate':
            return (
              match.type === 'candidate' &&
              match.candidate === gridEntry.candidate
            );

          case 'yesno':
            return (
              match.type === 'yesno' &&
              match.question === gridEntry.question &&
              match.option === gridEntry.option
            );

          default:
            throwIllegalValue(gridEntry, 'type');
        }
      })
    );

    if (!gridEntryIsMatched) {
      switch (gridEntry.type) {
        case 'candidate':
          unmatched.push({
            type: 'candidate',
            office: gridEntry.office,
            candidate: gridEntry.candidate,
          });
          break;

        case 'yesno':
          unmatched.push({
            type: 'yesno',
            question: gridEntry.question,
            option: gridEntry.option,
          });
          break;

        default:
          throwIllegalValue(gridEntry, 'type');
      }
    }
  }

  return ok({
    matched: [frontMatches, backMatches],
    unmatched,
  });
}

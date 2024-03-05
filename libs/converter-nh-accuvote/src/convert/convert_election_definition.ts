import { findTemplateGridAndBubbles } from '@votingworks/ballot-interpreter';
import {
  assert,
  err,
  ok,
  resultBlock,
  throwIllegalValue,
  typedAs,
} from '@votingworks/basics';
import { Election, GridPosition, getContests } from '@votingworks/types';
import { convertElectionDefinitionHeader } from './convert_election_definition_header';
import { matchContestOptionsOnGrid } from './match_contest_options_on_grid';
import {
  ConvertIssueKind,
  ConvertResult,
  NewHampshireBallotCardDefinition,
  PairColumnEntriesIssueKind,
  TemplateBubbleGridEntry,
  ConvertIssue,
} from './types';

/**
 * Convert New Hampshire XML files to a single {@link Election} object.
 */
export function convertElectionDefinition(
  cardDefinition: NewHampshireBallotCardDefinition
): ConvertResult {
  return resultBlock((fail) => {
    const convertHeader = convertElectionDefinitionHeader(
      cardDefinition.definition
    ).okOrElse(fail);

    const { election, issues: headerIssues } = convertHeader;
    let success = true;
    const issues = [...headerIssues];

    const findTemplateGridAndBubblesResult = findTemplateGridAndBubbles([
      cardDefinition.front,
      cardDefinition.back,
    ]);

    if (findTemplateGridAndBubblesResult.isErr()) {
      return err({
        issues: [
          ...issues,
          typedAs<ConvertIssue>({
            kind: ConvertIssueKind.TimingMarkDetectionFailed,
            message: 'failed to detect timing marks',
            side: 'front',
          }),
        ],
      });
    }

    let [frontGridAndBubbles, backGridAndBubbles] =
      findTemplateGridAndBubblesResult.ok();

    if (
      frontGridAndBubbles.metadata?.side === 'back' &&
      backGridAndBubbles.metadata?.side === 'front'
    ) {
      [frontGridAndBubbles, backGridAndBubbles] = [
        backGridAndBubbles,
        frontGridAndBubbles,
      ];
    }

    let { paperSize } = election.ballotLayout;

    const frontExpectedPaperSize =
      frontGridAndBubbles.grid.geometry.ballotPaperSize;
    const backExpectedPaperSize =
      backGridAndBubbles.grid.geometry.ballotPaperSize;

    assert(
      frontExpectedPaperSize === backExpectedPaperSize,
      'the paper size should be the same for both sides'
    );

    if (frontExpectedPaperSize !== paperSize) {
      success = frontExpectedPaperSize === backExpectedPaperSize;
      issues.push({
        kind: ConvertIssueKind.InvalidTemplateSize,
        message: `Template images do not match expected sizes. The XML definition says the template images should be "${paperSize}", but the template images are front="${frontExpectedPaperSize}" and back="${backExpectedPaperSize}".`,
        paperSize,
        frontTemplateSize: {
          width: cardDefinition.front.width,
          height: cardDefinition.front.height,
        },
        backTemplateSize: {
          width: cardDefinition.back.width,
          height: cardDefinition.back.height,
        },
      });
      paperSize = frontExpectedPaperSize;
    }

    if (frontGridAndBubbles.metadata && backGridAndBubbles.metadata) {
      if (frontGridAndBubbles.metadata.side !== 'front') {
        success = false;
        issues.push({
          kind: ConvertIssueKind.InvalidTimingMarkMetadata,
          message: `front page timing mark metadata is invalid: side=${frontGridAndBubbles.metadata.side}`,
          side: 'front',
          timingMarkBits: frontGridAndBubbles.metadata.bits,
          timingMarks: frontGridAndBubbles.grid.partialTimingMarks,
        });
      }

      if (backGridAndBubbles.metadata.side !== 'back') {
        success = false;
        issues.push({
          kind: ConvertIssueKind.InvalidTimingMarkMetadata,
          message: `back page timing mark metadata is invalid: side=${backGridAndBubbles.metadata.side}`,
          side: 'back',
          timingMarkBits: backGridAndBubbles.metadata.bits,
          timingMarks: backGridAndBubbles.grid.partialTimingMarks,
        });
      }
    }

    if (!success) {
      return err({
        issues,
        election,
      });
    }

    const frontMetadata = frontGridAndBubbles.metadata;
    const ballotStyleId = `card-number-${
      frontMetadata?.side === 'front' ? frontMetadata.cardNumber : 1
    }`;

    const frontTemplateBubbles = frontGridAndBubbles.bubbles;
    const backTemplateBubbles = backGridAndBubbles.bubbles;

    const gridLayout = election.gridLayouts?.[0];
    assert(gridLayout, 'grid layout missing');

    const ballotStyle = election.ballotStyles[0];
    assert(ballotStyle, 'ballot style missing');

    const bubbleGrid = [
      ...frontTemplateBubbles.map<TemplateBubbleGridEntry>((bubble) => ({
        side: 'front',
        column: bubble.x,
        row: bubble.y,
      })),
      ...backTemplateBubbles.map<TemplateBubbleGridEntry>((bubble) => ({
        side: 'back',
        column: bubble.x,
        row: bubble.y,
      })),
    ];

    const pairColumnEntriesResult = matchContestOptionsOnGrid(
      getContests({ ballotStyle, election }),
      gridLayout.gridPositions.map<GridPosition>((gridPosition) => ({
        ...gridPosition,
      })),
      bubbleGrid
    );

    if (pairColumnEntriesResult.isErr()) {
      success = false;

      for (const issue of pairColumnEntriesResult.err().issues) {
        switch (issue.kind) {
          case PairColumnEntriesIssueKind.ColumnCountMismatch:
            issues.push({
              kind: ConvertIssueKind.MismatchedOvalGrids,
              message: `XML definition and ballot images have different number of columns containing ovals: ${issue.columnCounts[0]} vs ${issue.columnCounts[1]}`,
              pairColumnEntriesIssue: issue,
            });
            break;

          case PairColumnEntriesIssueKind.ColumnEntryCountMismatch:
            issues.push({
              kind: ConvertIssueKind.MismatchedOvalGrids,
              message: `XML definition and ballot images have different number of entries in column ${issue.columnIndex}: ${issue.columnEntryCounts[0]} vs ${issue.columnEntryCounts[1]}`,
              pairColumnEntriesIssue: issue,
            });
            break;

          default:
            throwIllegalValue(issue, 'kind');
        }
      }
    }

    const mergedGrids = pairColumnEntriesResult.isOk()
      ? pairColumnEntriesResult.ok().pairs
      : pairColumnEntriesResult.err().pairs;
    const result: Election = {
      ...election,
      ballotLayout: {
        ...election.ballotLayout,
        paperSize,
      },
      ballotStyles: [
        {
          ...ballotStyle,
          id: ballotStyleId,
        },
      ],
      gridLayouts: [
        {
          ...gridLayout,
          ballotStyleId,
          gridPositions: mergedGrids.map(([definition, bubble]) =>
            definition.type === 'option'
              ? {
                  ...definition,
                  side: bubble.side,
                  column: bubble.column,
                  row: bubble.row,
                }
              : {
                  ...definition,
                  side: bubble.side,
                  column: bubble.column,
                  row: bubble.row,
                  // This area is based on the largest rectangle that fits in
                  // the write-in box without intersecting with any of the contest
                  // labels (there may be more than one in a multi-seat
                  // contest). Some examples of the ballots this was based on
                  // can be found in the NH elections in libs/fixtures.
                  writeInArea: {
                    x: bubble.column - 5,
                    y: bubble.row - 0.65,
                    width: 4.5,
                    height: 0.85,
                  },
                }
          ),
        },
      ],
    };

    return ok({ issues, election: result });
  });
}

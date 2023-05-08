import {
  assert,
  err,
  ok,
  resultBlock,
  throwIllegalValue,
} from '@votingworks/basics';
import { Debugger, noDebug } from '@votingworks/image-utils';
import { Election, GridPosition, getContests } from '@votingworks/types';
import {
  findTemplateOvals,
  getTemplateBallotCardGeometry,
  getTemplateBallotPaperSize,
} from '../accuvote';
import { interpretBallotCardLayout } from '../interpret/interpret_ballot_card_layout';
import { FrontMarksMetadata } from '../types';
import { convertElectionDefinitionHeader } from './convert_election_definition_header';
import { matchContestOptionsOnGrid } from './match_contest_options_on_grid';
import {
  ConvertIssueKind,
  ConvertResult,
  NewHampshireBallotCardDefinition,
  PairColumnEntriesIssueKind,
  TemplateOvalGridEntry,
} from './types';

/**
 * Convert New Hampshire XML files to a single {@link Election} object.
 */
export function convertElectionDefinition(
  cardDefinition: NewHampshireBallotCardDefinition,
  {
    ovalTemplate,
    debug: imdebug = noDebug(),
  }: { ovalTemplate: ImageData; debug?: Debugger }
): ConvertResult {
  return resultBlock((fail) => {
    const convertHeader = convertElectionDefinitionHeader(
      cardDefinition.definition
    ).okOrElse(fail);

    const { election, issues: headerIssues } = convertHeader;
    let success = true;
    const issues = [...headerIssues];

    let paperSize = election.ballotLayout?.paperSize;

    const frontExpectedPaperSize = getTemplateBallotPaperSize({
      width: cardDefinition.front.width,
      height: cardDefinition.front.height,
    });
    const backExpectedPaperSize = getTemplateBallotPaperSize({
      width: cardDefinition.back.width,
      height: cardDefinition.back.height,
    });

    if (
      !frontExpectedPaperSize ||
      !backExpectedPaperSize ||
      frontExpectedPaperSize !== backExpectedPaperSize ||
      frontExpectedPaperSize !== paperSize
    ) {
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

    assert(paperSize, 'paperSize should always be set');
    const expectedCardGeometry = getTemplateBallotCardGeometry(paperSize);

    const frontLayout = imdebug.capture('front', () => {
      imdebug.imageData(0, 0, cardDefinition.front);
      return interpretBallotCardLayout(cardDefinition.front, {
        geometry: expectedCardGeometry,
        debug: imdebug,
      });
    });

    if (!frontLayout) {
      success = false;
      issues.push({
        kind: ConvertIssueKind.TimingMarkDetectionFailed,
        message: 'no timing marks found on front',
        side: 'front',
      });
    }

    const backLayout = imdebug.capture('back', () => {
      imdebug.imageData(0, 0, cardDefinition.back);
      return interpretBallotCardLayout(cardDefinition.back, {
        geometry: expectedCardGeometry,
        debug: imdebug,
      });
    });

    if (!backLayout) {
      success = false;
      issues.push({
        kind: ConvertIssueKind.TimingMarkDetectionFailed,
        message: 'no timing marks found on back',
        side: 'back',
      });
    }

    if (frontLayout.side !== 'front') {
      success = false;
      issues.push({
        kind: ConvertIssueKind.InvalidTimingMarkMetadata,
        message: `front page timing mark metadata is invalid: side=${frontLayout.side}`,
        side: 'front',
        timingMarkBits: frontLayout.metadata.bits,
        timingMarks: frontLayout.partialTimingMarks,
      });
    }

    if (!success) {
      return err({
        issues,
        election,
      });
    }

    const frontMetadata = frontLayout.metadata as FrontMarksMetadata;
    const ballotStyleId = `card-number-${frontMetadata.cardNumber}`;

    const frontTemplateOvals = imdebug.capture('front ovals', () =>
      findTemplateOvals(
        cardDefinition.front,
        ovalTemplate,
        frontLayout.completeTimingMarks,
        { usableArea: expectedCardGeometry.frontUsableArea, debug: imdebug }
      )
    );
    const backTemplateOvals = imdebug.capture('back ovals', () =>
      findTemplateOvals(
        cardDefinition.back,
        ovalTemplate,
        backLayout.completeTimingMarks,
        { usableArea: expectedCardGeometry.backUsableArea, debug: imdebug }
      )
    );

    const gridLayout = election.gridLayouts?.[0];
    assert(gridLayout, 'grid layout missing');

    const ballotStyle = election.ballotStyles[0];
    assert(ballotStyle, 'ballot style missing');

    const ovalGrid = [
      ...frontTemplateOvals.map<TemplateOvalGridEntry>((oval) => ({
        ...oval,
        side: 'front',
      })),
      ...backTemplateOvals.map<TemplateOvalGridEntry>((oval) => ({
        ...oval,
        side: 'back',
      })),
    ];

    const pairColumnEntriesResult = matchContestOptionsOnGrid(
      getContests({ ballotStyle, election }),
      gridLayout.gridPositions.map<GridPosition>((gridPosition) => ({
        ...gridPosition,
      })),
      ovalGrid
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
        ...(election.ballotLayout ?? {}),
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
          gridPositions: mergedGrids.map(([definition, oval]) => ({
            ...definition,
            side: oval.side,
            column: oval.column,
            row: oval.row,
          })),
        },
      ],
    };

    return ok({ issues, election: result });
  });
}

import fontkit from '@pdf-lib/fontkit';
import {
  Rect,
  TemplateGridAndBubbles,
  TimingMarkGrid,
} from '@votingworks/ballot-interpreter';
import { assert, iter, throwIllegalValue } from '@votingworks/basics';
import {
  GridLayout,
  GridPositionOption,
  GridPositionWriteIn,
  SheetOf,
} from '@votingworks/types';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { Color, PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import {
  BallotGridPoint,
  BallotGridValue,
  ImageSize,
  PdfGridValue,
  ballotGridPointToImagePoint,
  ballotGridPointToPdfPoint,
  distance,
  imagePointToPdfPoint,
  imageSizeToPdfSize,
  newBallotGridPoint,
  newImagePoint,
  newImageSize,
  newPdfPoint,
  newPdfSize,
} from './convert/coordinates';
import { MatchBubblesResult } from './convert/types';
import { TextAppearanceConfig, fitTextWithinSize } from './drawing';
import {
  byColumn,
  byRow,
} from './convert/bubble-matching/spacial-mapping/ordering';

/**
 * The color purple used by VotingWorks.
 */
export const VotingWorksPurple = rgb(102 / 255, 56 / 255, 182 / 255);

/**
 * The number of pixels per inch in a PDF.
 */
export const PDF_PPI = 72;

/**
 * Draws annotations on a PDF page to indicate the locations of timing marks.
 */
export function addTimingMarkAnnotationsToPdfPage(
  page: PDFPage,
  grid: TimingMarkGrid
): void {
  const timingMarkTemplateSize = grid.geometry.timingMarkSize as ImageSize;
  const timingMarkPdfSize = imageSizeToPdfSize(
    grid.geometry.pixelsPerInch,
    PDF_PPI,
    timingMarkTemplateSize
  );
  const timingMarks = [
    ...grid.completeTimingMarks.leftRects,
    ...grid.completeTimingMarks.topRects,
    ...grid.completeTimingMarks.rightRects,
    ...grid.completeTimingMarks.bottomRects,
  ];

  for (const timingMark of timingMarks) {
    const timingMarkPdfPointBottomLeft = imagePointToPdfPoint(
      newPdfSize(page.getWidth(), page.getHeight()),
      grid.geometry.pixelsPerInch,
      PDF_PPI,
      newImagePoint(timingMark.left, timingMark.top + timingMark.height)
    );

    page.drawRectangle({
      x: timingMarkPdfPointBottomLeft.x + 0.5,
      y: timingMarkPdfPointBottomLeft.y + 0.5,
      width: timingMarkPdfSize.width,
      height: timingMarkPdfSize.height,
      color: rgb(0, 0, 1.0),
    });
  }
}

function addTimingMarkGridAnnotationsToPdfPage(
  page: PDFPage,
  grid: TimingMarkGrid
): void {
  const pageSize = newPdfSize(page.getWidth(), page.getHeight());
  const { geometry } = grid;

  for (const [leftRect, rightRect] of iter(
    grid.completeTimingMarks.leftRects
  ).zip(grid.completeTimingMarks.rightRects)) {
    const leftRectCenterTemplatePoint = newImagePoint(
      leftRect.left + leftRect.width / 2,
      leftRect.top + leftRect.height / 2
    );
    const rightRectCenterTemplatePoint = newImagePoint(
      rightRect.left + rightRect.width / 2,
      rightRect.top + rightRect.height / 2
    );

    const leftRectCenterPdfPoint = imagePointToPdfPoint(
      pageSize,
      geometry.pixelsPerInch,
      PDF_PPI,
      leftRectCenterTemplatePoint
    );
    const rightRectCenterPdfPoint = imagePointToPdfPoint(
      pageSize,
      geometry.pixelsPerInch,
      PDF_PPI,
      rightRectCenterTemplatePoint
    );

    page.drawLine({
      start: { x: leftRectCenterPdfPoint.x, y: leftRectCenterPdfPoint.y },
      end: { x: rightRectCenterPdfPoint.x, y: rightRectCenterPdfPoint.y },
      thickness: 0.5,
      color: rgb(0, 1.0, 0),
    });
  }

  for (const [topRect, bottomRect] of iter(
    grid.completeTimingMarks.topRects
  ).zip(grid.completeTimingMarks.bottomRects)) {
    const topRectCenterTemplatePoint = newImagePoint(
      topRect.left + topRect.width / 2,
      topRect.top + topRect.height / 2
    );
    const bottomRectCenterTemplatePoint = newImagePoint(
      bottomRect.left + bottomRect.width / 2,
      bottomRect.top + bottomRect.height / 2
    );

    const topRectCenterPdfPoint = imagePointToPdfPoint(
      pageSize,
      geometry.pixelsPerInch,
      PDF_PPI,
      topRectCenterTemplatePoint
    );
    const bottomRectCenterPdfPoint = imagePointToPdfPoint(
      pageSize,
      geometry.pixelsPerInch,
      PDF_PPI,
      bottomRectCenterTemplatePoint
    );

    page.drawLine({
      start: { x: topRectCenterPdfPoint.x, y: topRectCenterPdfPoint.y },
      end: { x: bottomRectCenterPdfPoint.x, y: bottomRectCenterPdfPoint.y },
      thickness: 0.5,
      color: rgb(0, 1.0, 0),
    });
  }
}

/**
 * Styles for drawing a bubble annotation.
 */
export enum BubbleAnnotationStyle {
  /**
   * The "?" character.
   */
  QuestionMark = 'QuestionMark',

  /**
   * A filled bubble.
   */
  FilledBubble = 'FilledBubble',

  /**
   * An X.
   */
  X = 'X',
}

/**
 * Draws annotations on a PDF page to indicate the locations of bubbles.
 */
export function addBubbleAnnotationsToPdfPage({
  page,
  grid,
  bubbles,
  color,
  font,
  style = BubbleAnnotationStyle.FilledBubble,
}: {
  page: PDFPage;
  grid: TimingMarkGrid;
  bubbles: BallotGridPoint[];
  color: Color;
  font?: PDFFont;
  style?: BubbleAnnotationStyle;
}): void {
  const pageSize = newPdfSize(page.getWidth(), page.getHeight());

  for (const bubble of bubbles) {
    const bubbleCenterTemplatePoint = ballotGridPointToImagePoint(
      grid.completeTimingMarks,
      newBallotGridPoint(bubble.x, bubble.y)
    );
    const bubbleCenterPdfPoint = imagePointToPdfPoint(
      pageSize,
      grid.geometry.pixelsPerInch,
      PDF_PPI,
      bubbleCenterTemplatePoint
    );

    switch (style) {
      case BubbleAnnotationStyle.FilledBubble: {
        const width = 0.2 * PDF_PPI;
        const height = 0.13 * PDF_PPI;
        const borderRadius = 0.07 * PDF_PPI;

        const path = `
          h ${width - 2 * borderRadius}
          a ${borderRadius} ${borderRadius} 0 0 1 ${borderRadius} ${borderRadius}
          v ${height - 2 * borderRadius}
          a ${borderRadius} ${borderRadius} 0 0 1 ${-borderRadius} ${borderRadius}
          h ${-(width - 2 * borderRadius)}
          a ${borderRadius} ${borderRadius} 0 0 1 ${-borderRadius} ${-borderRadius}
          v ${-(height - 2 * borderRadius)}
          a ${borderRadius} ${borderRadius} 0 0 1 ${borderRadius} ${-borderRadius}
          z
        `;

        page.drawSvgPath(path, {
          color,
          x: bubbleCenterPdfPoint.x - borderRadius / 2,
          y: bubbleCenterPdfPoint.y + height / 2,
        });

        break;
      }

      case BubbleAnnotationStyle.X: {
        const bubbleMarkSize = 2;
        page.drawLine({
          start: {
            x: bubbleCenterPdfPoint.x - bubbleMarkSize,
            y: bubbleCenterPdfPoint.y - bubbleMarkSize,
          },
          end: {
            x: bubbleCenterPdfPoint.x + bubbleMarkSize,
            y: bubbleCenterPdfPoint.y + bubbleMarkSize,
          },
          thickness: 1,
          color,
        });
        page.drawLine({
          start: {
            x: bubbleCenterPdfPoint.x - bubbleMarkSize,
            y: bubbleCenterPdfPoint.y + bubbleMarkSize,
          },
          end: {
            x: bubbleCenterPdfPoint.x + bubbleMarkSize,
            y: bubbleCenterPdfPoint.y - bubbleMarkSize,
          },
          thickness: 1,
          color,
        });
        break;
      }

      case BubbleAnnotationStyle.QuestionMark: {
        assert(font, 'Font must be provided for QuestionMark style');
        const label = '?';
        const fontSize = 14;
        const width = font.widthOfTextAtSize(label, fontSize);
        const height = font.heightAtSize(fontSize);
        page.drawText(label, {
          x: bubbleCenterPdfPoint.x - width / 2,
          y: bubbleCenterPdfPoint.y - height / 3,
          size: fontSize,
          font,
          color,
        });
        break;
      }

      default:
        throwIllegalValue(style);
    }
  }
}

function addContestOptionAnnotationsToPdfPage({
  page,
  grid,
  gridPositions,
  minimumDistanceBetweenBubbles,
  optionTextConfig,
  contestTextConfig,
}: {
  page: PDFPage;
  grid: TimingMarkGrid;
  gridPositions: GridPositionOption[];
  minimumDistanceBetweenBubbles: BallotGridValue;
  optionTextConfig: TextAppearanceConfig;
  contestTextConfig: TextAppearanceConfig;
}): void {
  const pageSize = newPdfSize(page.getWidth(), page.getHeight());
  const timingMarkTemplateSize = grid.geometry.timingMarkSize as ImageSize;
  const timingMarkPdfSize = imageSizeToPdfSize(
    grid.geometry.pixelsPerInch,
    PDF_PPI,
    timingMarkTemplateSize
  );

  for (const gridPosition of gridPositions) {
    const bubbleCenterTemplatePoint = ballotGridPointToImagePoint(
      grid.completeTimingMarks,
      newBallotGridPoint(gridPosition.column, gridPosition.row)
    );

    const bubbleCenterPdfPoint = imagePointToPdfPoint(
      pageSize,
      grid.geometry.pixelsPerInch,
      PDF_PPI,
      bubbleCenterTemplatePoint
    );

    const contest = gridPosition.contestId;
    const option = gridPosition.optionId;

    const maximumOptionNameWidth = optionTextConfig.font.widthOfTextAtSize(
      'Modest Option Name Length',
      optionTextConfig.maxFontSize
    );
    const maximumContestNameWidth = contestTextConfig.font.widthOfTextAtSize(
      'Modest Contest Name Length',
      contestTextConfig.maxFontSize
    );

    const textColor = rgb(1.0, 1.0, 1.0);
    const textBackgroundColor = rgb(0.3, 0.6, 0.3);
    const textBackgroundOpacity = 0.8;
    const textBackgroundPadding = 2;

    const sizedOptionText = fitTextWithinSize({
      text: option,
      size: newPdfSize(maximumOptionNameWidth, Number.POSITIVE_INFINITY),
      config: optionTextConfig,
    });
    assert(sizedOptionText, 'Option text should always fit within bounds');

    const sizedContestText = fitTextWithinSize({
      text: contest,
      size: newPdfSize(maximumContestNameWidth, Number.POSITIVE_INFINITY),
      config: contestTextConfig,
    });
    assert(sizedContestText, 'Contest text should always fit within bounds');

    const combinedWidth = Math.max(
      sizedOptionText.size.width,
      sizedContestText.size.width
    );
    const combinedHeight =
      distance(
        imagePointToPdfPoint(
          pageSize,
          grid.geometry.pixelsPerInch,
          PDF_PPI,
          ballotGridPointToImagePoint(
            grid.completeTimingMarks,
            newBallotGridPoint(0, 0)
          )
        ),
        imagePointToPdfPoint(
          pageSize,
          grid.geometry.pixelsPerInch,
          PDF_PPI,
          ballotGridPointToImagePoint(
            grid.completeTimingMarks,
            newBallotGridPoint(0, minimumDistanceBetweenBubbles)
          )
        )
      ) -
      textBackgroundPadding * 2 -
      1;

    const boundingRect: Rect = {
      left:
        bubbleCenterPdfPoint.x - timingMarkPdfSize.width / 2 - combinedWidth,
      top: bubbleCenterPdfPoint.y - combinedHeight / 2,
      width: combinedWidth,
      height: combinedHeight,
    };

    page.drawRectangle({
      x: boundingRect.left - textBackgroundPadding,
      y: boundingRect.top - textBackgroundPadding,
      width: boundingRect.width + textBackgroundPadding * 2,
      height: boundingRect.height + textBackgroundPadding * 2,
      color: textBackgroundColor,
      opacity: textBackgroundOpacity,
    });

    page.drawText(sizedOptionText.text, {
      x: boundingRect.left + boundingRect.width - sizedOptionText.size.width,
      y: boundingRect.top + boundingRect.height - sizedOptionText.size.height,
      size: sizedOptionText.fontSize,
      color: textColor,
      font: optionTextConfig.font,
    });

    page.drawText(sizedContestText.text, {
      x: boundingRect.left + boundingRect.width - sizedContestText.size.width,
      y: boundingRect.top,
      size: sizedContestText.fontSize,
      color: textColor,
      font: contestTextConfig.font,
    });
  }
}

function addWriteInAnnotationsToPdfPage({
  page,
  grid,
  gridPositions,
  writeInTextConfig,
  contestTextConfig,
}: {
  page: PDFPage;
  grid: TimingMarkGrid;
  gridPositions: GridPositionWriteIn[];
  writeInTextConfig: TextAppearanceConfig;
  contestTextConfig: TextAppearanceConfig;
}): void {
  const pageSize = newPdfSize(page.getWidth(), page.getHeight());

  for (const gridPosition of gridPositions) {
    const originTemplatePoint = ballotGridPointToImagePoint(
      grid.completeTimingMarks,
      newBallotGridPoint(0, 0)
    );
    const unitTemplatePoint = ballotGridPointToImagePoint(
      grid.completeTimingMarks,
      newBallotGridPoint(1, 1)
    );

    const timingMarkTemplateUnitGridSize = newImageSize(
      unitTemplatePoint.x - originTemplatePoint.x,
      unitTemplatePoint.y - originTemplatePoint.y
    );

    const writeInAreaTemplateRect: Rect = {
      left:
        originTemplatePoint.x +
        gridPosition.writeInArea.x * timingMarkTemplateUnitGridSize.width,
      top:
        originTemplatePoint.y +
        gridPosition.writeInArea.y * timingMarkTemplateUnitGridSize.height,
      width:
        gridPosition.writeInArea.width * timingMarkTemplateUnitGridSize.width,
      height:
        gridPosition.writeInArea.height * timingMarkTemplateUnitGridSize.height,
    };

    const writeInAreaTemplateBottomLeft = newImagePoint(
      writeInAreaTemplateRect.left,
      writeInAreaTemplateRect.top + writeInAreaTemplateRect.height - 1
    );

    const writeInAreaTemplateTopRight = newImagePoint(
      writeInAreaTemplateRect.left + writeInAreaTemplateRect.width - 1,
      writeInAreaTemplateRect.top
    );

    const writeInAreaPdfBottomLeft = imagePointToPdfPoint(
      pageSize,
      grid.geometry.pixelsPerInch,
      PDF_PPI,
      writeInAreaTemplateBottomLeft
    );

    const writeInAreaPdfTopRight = imagePointToPdfPoint(
      pageSize,
      grid.geometry.pixelsPerInch,
      PDF_PPI,
      writeInAreaTemplateTopRight
    );

    const textColor = rgb(1.0, 1.0, 1.0);
    const textBackgroundColor = rgb(0.5, 0.45, 0.2);
    const textBackgroundOpacity = 0.8;

    page.drawRectangle({
      x: writeInAreaPdfBottomLeft.x,
      y: writeInAreaPdfBottomLeft.y,
      width: writeInAreaPdfTopRight.x - writeInAreaPdfBottomLeft.x,
      height: writeInAreaPdfTopRight.y - writeInAreaPdfBottomLeft.y,
      color: textBackgroundColor,
      opacity: textBackgroundOpacity,
    });

    const option = `Write-in #${gridPosition.writeInIndex + 1}`;
    const contest = gridPosition.contestId;

    const sizedOptionText = fitTextWithinSize({
      text: option,
      size: newPdfSize(
        writeInAreaPdfTopRight.x - writeInAreaPdfBottomLeft.x,
        writeInAreaPdfTopRight.y - writeInAreaPdfBottomLeft.y
      ),
      config: writeInTextConfig,
    });
    assert(sizedOptionText, 'Option text should always fit within bounds');

    page.drawText(sizedOptionText.text, {
      x: writeInAreaPdfTopRight.x - sizedOptionText.size.width,
      y: writeInAreaPdfTopRight.y - sizedOptionText.size.height,
      size: sizedOptionText.fontSize,
      color: textColor,
      font: writeInTextConfig.font,
    });

    const sizedContestText = fitTextWithinSize({
      text: contest,
      size: newPdfSize(
        writeInAreaPdfTopRight.x - writeInAreaPdfBottomLeft.x,
        writeInAreaPdfTopRight.y -
          writeInAreaPdfBottomLeft.y -
          sizedOptionText.size.height
      ),
      config: contestTextConfig,
    });
    assert(sizedContestText, 'Contest text should always fit within bounds');

    page.drawText(sizedContestText.text, {
      x: writeInAreaPdfTopRight.x - sizedContestText.size.width,
      y: writeInAreaPdfBottomLeft.y,
      size: sizedContestText.fontSize,
      color: textColor,
      font: contestTextConfig.font,
    });
  }
}

function readRobotoBoldFont(): Promise<Uint8Array> {
  return readFile(
    join(__dirname, '../../hmpb/render-backend/assets/fonts/Roboto-Bold.ttf')
  );
}

function readRobotoFont(): Promise<Uint8Array> {
  return readFile(
    join(__dirname, '../../hmpb/render-backend/assets/fonts/Roboto.ttf')
  );
}

/**
 * Draws text next to a bubble on a PDF page.
 */
export function addBubbleLabelAnnotation({
  page,
  grid,
  bubble,
  label,
  font,
  fontSize,
  color,
  backgroundColor,
  backgroundOpacity,
}: {
  page: PDFPage;
  grid: TimingMarkGrid;
  bubble: BallotGridPoint;
  label: string;
  font: PDFFont;
  fontSize: number;
  color: Color;
  backgroundColor?: Color;
  backgroundOpacity?: number;
}): void {
  const timingMarkTemplateSize = grid.geometry.timingMarkSize as ImageSize;
  const timingMarkPdfSize = imageSizeToPdfSize(
    grid.geometry.pixelsPerInch,
    PDF_PPI,
    timingMarkTemplateSize
  );
  const bubbleCenter = ballotGridPointToPdfPoint(
    newPdfSize(page.getWidth(), page.getHeight()),
    grid.geometry.pixelsPerInch,
    PDF_PPI,
    grid.completeTimingMarks,
    bubble
  );

  const textWidth = font.widthOfTextAtSize(label, fontSize);
  const textHeight = font.heightAtSize(fontSize);

  const textOrigin = newPdfPoint(
    bubbleCenter.x - textWidth - timingMarkPdfSize.width,
    bubbleCenter.y - textHeight / 2
  );

  if (backgroundColor) {
    page.drawRectangle({
      x: textOrigin.x,
      y: textOrigin.y,
      width: textWidth,
      height: textHeight,
      color: backgroundColor,
      opacity: backgroundOpacity,
    });
  }

  page.drawText(label, {
    x: textOrigin.x,
    y: textOrigin.y,
    size: fontSize,
    font,
    color,
  });
}

/**
 * Registers our fonts with a PDF document.
 */
export async function registerFonts(
  document: PDFDocument
): Promise<{ regular: PDFFont; bold: PDFFont }> {
  document.registerFontkit(fontkit);
  const robotoBold = await document.embedFont(await readRobotoBoldFont());
  const roboto = await document.embedFont(await readRobotoFont());
  return { regular: roboto, bold: robotoBold };
}

/**
 * Adds annotations to a PDF to assist with ballot proofing.
 */
export async function addBallotProofingAnnotationsToPdf(
  document: PDFDocument,
  gridLayout: GridLayout,
  templateGrid: TemplateGridAndBubbles
): Promise<void> {
  const pages = document.getPages();
  const { regular: roboto, bold: robotoBold } = await registerFonts(document);

  for (const [pageNumber, [templateGridSide, page]] of iter(templateGrid)
    .zip(pages)
    .enumerate()) {
    addTimingMarkAnnotationsToPdfPage(page, templateGridSide.grid);
    addTimingMarkGridAnnotationsToPdfPage(page, templateGridSide.grid);
    addBubbleAnnotationsToPdfPage({
      page,
      grid: templateGridSide.grid,
      bubbles: templateGridSide.bubbles as BallotGridPoint[],
      color: VotingWorksPurple,
      font: roboto,
      style: BubbleAnnotationStyle.FilledBubble,
    });

    const [contestOptionGridPositions, writeInGridPositions] = iter(
      gridLayout.gridPositions
    )
      .filter(
        (gridPosition) =>
          gridPosition.side === (pageNumber === 0 ? 'front' : 'back')
      )
      .partition((gridPosition) => gridPosition.type === 'option') as [
      GridPositionOption[],
      GridPositionWriteIn[],
    ];

    const minimumDistanceBetweenBubbles = (iter(
      [...contestOptionGridPositions, ...writeInGridPositions].sort(byColumn)
    )
      .groupBy((a, b) => a.column === b.column)
      .flatMap((gridPositionsInColumn) =>
        iter([...gridPositionsInColumn].sort(byRow))
          .windows(2)
          .map(([a, b]) => b.row - a.row)
      )
      .min() ?? 1) as BallotGridValue;

    const optionTextConfig: TextAppearanceConfig = {
      font: robotoBold,
      minFontSize: 4,
      maxFontSize: 8,
    };

    const contestTextConfig: TextAppearanceConfig = {
      font: roboto,
      minFontSize: 3,
      maxFontSize: 7,
    };

    const writeInTextConfig = optionTextConfig;

    addContestOptionAnnotationsToPdfPage({
      page,
      grid: templateGridSide.grid,
      gridPositions: contestOptionGridPositions,
      minimumDistanceBetweenBubbles,
      optionTextConfig,
      contestTextConfig,
    });

    addWriteInAnnotationsToPdfPage({
      page,
      grid: templateGridSide.grid,
      gridPositions: writeInGridPositions,
      writeInTextConfig,
      contestTextConfig,
    });
  }
}

/**
 * Adds annotations to a PDF with the results of matching bubbles to contests.
 */
export async function addMatchResultAnnotations({
  document,
  grids,
  matchResult: { matched, unmatched },
}: {
  document: PDFDocument;
  grids: SheetOf<TimingMarkGrid>;
  matchResult: MatchBubblesResult;
}): Promise<void> {
  const { bold } = await registerFonts(document);

  for (const [proofPage, grid, matchesForSide, side] of iter(
    document.getPages()
  ).zip(grids, matched, ['front', 'back'] as const)) {
    addTimingMarkAnnotationsToPdfPage(proofPage, grid);
    addBubbleAnnotationsToPdfPage({
      page: proofPage,
      grid,
      bubbles: matchesForSide.flatMap((match) =>
        match.type === 'candidate' || match.type === 'yesno'
          ? [match.bubble]
          : match.type === 'hacky-question'
          ? [match.yesBubble, match.noBubble]
          : throwIllegalValue(match)
      ),
      color: VotingWorksPurple,
      font: bold,
    });

    const unmatchedBubbles = iter(unmatched)
      .filterMap((entry) =>
        entry.type === 'bubble' && entry.side === side
          ? entry.bubble
          : undefined
      )
      .toArray();

    addBubbleAnnotationsToPdfPage({
      page: proofPage,
      grid,
      bubbles: unmatchedBubbles,
      style: BubbleAnnotationStyle.QuestionMark,
      color: rgb(1, 0, 0),
      font: bold,
    });

    for (const match of matchesForSide) {
      const labeledBubbles: Array<{
        bubble: BallotGridPoint;
        label: string;
      }> = [];

      switch (match.type) {
        case 'candidate': {
          labeledBubbles.push({
            bubble: match.bubble,
            label: match.candidate.writeIn
              ? `write-in (${match.office.name})`
              : match.candidate.name,
          });
          break;
        }

        case 'yesno': {
          labeledBubbles.push({
            bubble: match.bubble,
            label: match.option,
          });
          break;
        }

        case 'hacky-question': {
          labeledBubbles.push(
            {
              bubble: match.yesBubble,
              label: `Yes (${match.question.title})`,
            },
            {
              bubble: match.noBubble,
              label: `No (${match.question.title})`,
            }
          );
          break;
        }

        default:
          throwIllegalValue(match, 'type');
      }

      for (const { label, bubble } of labeledBubbles) {
        const textSize = fitTextWithinSize({
          text: label,
          size: newPdfSize(80, Number.POSITIVE_INFINITY),
          config: {
            font: bold,
            minFontSize: 5,
            maxFontSize: 10,
          },
        });
        if (textSize) {
          addBubbleLabelAnnotation({
            page: proofPage,
            label: textSize.text,
            bubble,
            grid,
            color: rgb(1, 1, 1),
            backgroundColor: rgb(0, 0, 0),
            backgroundOpacity: 0.5,
            font: bold,
            fontSize: textSize.fontSize,
          });
        }
      }
    }
  }

  if (unmatched.length) {
    const frontProofPage = document.getPage(0);
    let nextUnmatchedEntryTop = frontProofPage.getHeight();

    const title = 'Unmatched';
    const titleFontSize = 14;
    const titleHeight = bold.heightAtSize(titleFontSize);

    frontProofPage.drawText(title, {
      x: 0,
      y: nextUnmatchedEntryTop - titleHeight,
      size: titleFontSize,
      font: bold,
      color: rgb(1, 0, 0),
    });
    nextUnmatchedEntryTop = (nextUnmatchedEntryTop -
      titleHeight) as PdfGridValue;

    for (const unmatchedEntry of unmatched) {
      let text: string;

      switch (unmatchedEntry.type) {
        case 'candidate':
          text = `${unmatchedEntry.office.name} - ${unmatchedEntry.candidate.name}`;
          break;

        case 'yesno':
          text = `${unmatchedEntry.question.title} - ${unmatchedEntry.option}`;
          break;

        case 'hacky-question':
          text = `${unmatchedEntry.question.title} - Yes/No`;
          break;

        case 'bubble':
          text = `Bubble at (${unmatchedEntry.side}, ${unmatchedEntry.bubble.x}, ${unmatchedEntry.bubble.y})`;
          break;

        default:
          throwIllegalValue(unmatchedEntry, 'type');
      }

      const fontSize = 10;
      const width = bold.widthOfTextAtSize(text, fontSize);
      const height = bold.heightAtSize(fontSize);
      frontProofPage.drawRectangle({
        x: 0,
        y: nextUnmatchedEntryTop - height,
        width,
        height,
        color: rgb(0.3, 0, 0),
        opacity: 0.8,
      });

      frontProofPage.drawText(text, {
        x: 0,
        y: nextUnmatchedEntryTop - height,
        size: fontSize,
        font: bold,
        color: rgb(1, 1, 1),
      });

      nextUnmatchedEntryTop = (nextUnmatchedEntryTop - height) as PdfGridValue;
    }
  }
}

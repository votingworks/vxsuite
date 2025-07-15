import {
  findTimingMarkGrid,
  TimingMarks,
} from '@votingworks/ballot-interpreter';
import { assert, extractErrorMessage } from '@votingworks/basics';
import { LogEventId, Logger } from '@votingworks/logging';
import { mapSheet, SheetOf } from '@votingworks/types';
import { ImageData } from 'canvas';
import { exists } from 'fs-extra';
import { DateTime } from 'luxon';
import { appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CSV_COLUMNS = [
  'Timestamp',
  'Top Slope',
  'Top Error Average',
  'Bottom Slope',
  'Bottom Error Average',
  'Left Slope',
  'Left Error Average',
  'Right Slope',
  'Right Error Average',
  'Horizontal Lines Alignment Diff',
  'Vertical Lines Alignment Diff',
  'Average Error',
];

interface ScannedPageAnalysis {
  topSlope: number;
  topError: number;
  bottomSlope: number;
  bottomError: number;
  leftSlope: number;
  leftError: number;
  rightSlope: number;
  rightError: number;
  horizontalAlignmentError: number;
  verticalAlignmentError: number;
  averageError: number;
}

function analyzeScannedPage(timingMarkGrid: TimingMarks): ScannedPageAnalysis {
  const topSlope = Math.atan2(
    timingMarkGrid.topLeftCorner.y - timingMarkGrid.topRightCorner.y,
    timingMarkGrid.topRightCorner.x - timingMarkGrid.topLeftCorner.x
  );
  const topError = Math.abs(topSlope);
  const bottomSlope = Math.atan2(
    timingMarkGrid.bottomLeftCorner.y - timingMarkGrid.bottomRightCorner.y,
    timingMarkGrid.bottomRightCorner.x - timingMarkGrid.bottomLeftCorner.x
  );
  const bottomError = Math.abs(bottomSlope);
  const leftSlope = Math.atan2(
    timingMarkGrid.bottomLeftCorner.y - timingMarkGrid.topLeftCorner.y,
    timingMarkGrid.topLeftCorner.x - timingMarkGrid.bottomLeftCorner.x
  );
  const leftError = Math.abs(leftSlope - Math.PI / 2);
  const rightSlope = Math.atan2(
    timingMarkGrid.bottomRightCorner.y - timingMarkGrid.topRightCorner.y,
    timingMarkGrid.topRightCorner.x - timingMarkGrid.bottomRightCorner.x
  );
  const rightError = Math.abs(rightSlope - Math.PI / 2);
  const horizontalAlignmentError = Math.abs(bottomSlope - topSlope);
  const verticalAlignmentError = Math.abs(leftSlope - rightSlope);
  const averageError = (topError + bottomError + leftError + rightError) / 4;

  return {
    topSlope,
    topError,
    bottomSlope,
    bottomError,
    leftSlope,
    leftError,
    rightSlope,
    rightError,
    horizontalAlignmentError,
    verticalAlignmentError,
    averageError,
  };
}

export async function writeScanPageAnalyses(
  logger: Logger,
  timestamp: DateTime,
  [front, back]: SheetOf<ImageData>,
  basedir: string,
  basename: string
): Promise<void> {
  try {
    const analyses = await mapSheet([front, back], async (image, side) => {
      const timingMarkGrid = findTimingMarkGrid(image);
      const analysis = analyzeScannedPage(timingMarkGrid);
      await writeFile(
        join(basedir, `${basename}-analysis-${side}.json`),
        JSON.stringify(analysis, null, 2)
      );
      return analysis;
    });

    const analysisCsvPath = join(basedir, 'electrical-testing-analysis.csv');
    if (!(await exists(analysisCsvPath))) {
      await writeFile(analysisCsvPath, `${CSV_COLUMNS.join(',')}\n`);
    }

    for (const analysis of analyses) {
      const csvValues = [
        timestamp.toISO(),
        analysis.topSlope,
        analysis.topError,
        analysis.bottomSlope,
        analysis.bottomError,
        analysis.leftSlope,
        analysis.leftError,
        analysis.rightSlope,
        analysis.rightError,
        analysis.horizontalAlignmentError,
        analysis.verticalAlignmentError,
        analysis.averageError,
      ];
      assert(
        csvValues.length === CSV_COLUMNS.length,
        `CSV row has incorrect number of values: expected ${CSV_COLUMNS.length}, got ${csvValues.length}`
      );
      await appendFile(analysisCsvPath, `${csvValues.join(',')}\n`);
    }
  } catch (e) {
    await logger.logAsCurrentRole(LogEventId.BackgroundTaskFailure, {
      disposition: 'failure',
      message: `Error while analyzing scanned images: ${extractErrorMessage(
        e
      )}`,
    });
  }
}

import { TimingMarks } from '@votingworks/ballot-interpreter';
import { assert, extractErrorMessage } from '@votingworks/basics';
import { LogEventId, Logger } from '@votingworks/logging';
import { mapSheet, SheetOf } from '@votingworks/types';
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

/**
 * Statistics about a scanned page. All values are in radians.
 */
export interface ScannedPageAnalysis {
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

export function analyzeScannedPage(
  timingMarkGrid: TimingMarks
): ScannedPageAnalysis {
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

export class ScanningSession {
  private readonly sheets: Array<
    SheetOf<{ path: string; analysis: ScannedPageAnalysis }>
  > = [];

  addSheetAnalysis(
    analyzedPaths: SheetOf<{ path: string; analysis: ScannedPageAnalysis }>
  ): void {
    this.sheets.push(analyzedPaths);
  }

  toJSON(): ScanningSessionData {
    function computeStat(values: readonly number[]): Stat {
      const mean =
        values.reduce((sum, value) => sum + value, 0) / values.length;
      const sorted = [...values].sort();
      const median =
        sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)];
      const variance =
        sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
        sorted.length;
      const stddev = Math.sqrt(variance);
      return { mean, median, stddev };
    }

    if (this.sheets.length === 0) {
      return { sheets: [], stats: undefined };
    }

    const pageStats = this.sheets.flatMap((sheet) => [
      sheet[0].analysis,
      sheet[1].analysis,
    ]);

    return {
      sheets: this.sheets,
      stats: {
        topSlope: computeStat(pageStats.map((a) => a.topSlope)),
        topError: computeStat(pageStats.map((a) => a.topError)),
        bottomSlope: computeStat(pageStats.map((a) => a.bottomSlope)),
        bottomError: computeStat(pageStats.map((a) => a.bottomError)),
        leftSlope: computeStat(pageStats.map((a) => a.leftSlope)),
        leftError: computeStat(pageStats.map((a) => a.leftError)),
        rightSlope: computeStat(pageStats.map((a) => a.rightSlope)),
        rightError: computeStat(pageStats.map((a) => a.rightError)),
        horizontalAlignmentError: computeStat(
          pageStats.map((a) => a.horizontalAlignmentError)
        ),
        verticalAlignmentError: computeStat(
          pageStats.map((a) => a.verticalAlignmentError)
        ),
        averageError: computeStat(pageStats.map((a) => a.averageError)),
      },
    };
  }
}

export interface Stat {
  mean: number;
  median: number;
  stddev: number;
}

export interface ScanningSessionData {
  sheets: Array<SheetOf<{ path: string; analysis: ScannedPageAnalysis }>>;
  stats?: { [K in keyof ScannedPageAnalysis]: Stat };
}

export async function writeScanPageAnalyses(
  logger: Logger,
  timestamp: DateTime,
  analyses: SheetOf<ScannedPageAnalysis>,
  basedir: string,
  basename: string
): Promise<void> {
  try {
    await mapSheet(analyses, async (analysis, side) => {
      await writeFile(
        join(basedir, `${basename}-analysis-${side}.json`),
        JSON.stringify(analysis, null, 2)
      );
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

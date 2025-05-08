import { assert, extractErrorMessage } from '@votingworks/basics';
import {
  analyzeScannedPage,
  grayImageFromRgbaImageData,
} from '@votingworks/hardware-scan-diagnostic';
import { LogEventId, Logger } from '@votingworks/logging';
import { mapSheet, SheetOf } from '@votingworks/types';
import { ImageData } from 'canvas';
import { exists } from 'fs-extra';
import { DateTime } from 'luxon';
import { appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CSV_COLUMNS = [
  'Timestamp',
  'Top Orientation',
  'Top Slope',
  'Top Intercept',
  'Top Error Average',
  'Bottom Orientation',
  'Bottom Slope',
  'Bottom Intercept',
  'Bottom Error Average',
  'Left Orientation',
  'Left Slope',
  'Left Intercept',
  'Left Error Average',
  'Right Orientation',
  'Right Slope',
  'Right Intercept',
  'Right Error Average',
  'Top Left Corner X',
  'Top Left Corner Y',
  'Top Right Corner X',
  'Top Right Corner Y',
  'Bottom Left Corner X',
  'Bottom Left Corner Y',
  'Bottom Right Corner X',
  'Bottom Right Corner Y',
  'Average Error',
  'Horizontal Lines Alignment Diff',
  'Vertical Lines Alignment Diff',
];

export async function writeScanPageAnalyses(
  logger: Logger,
  timestamp: DateTime,
  [front, back]: SheetOf<ImageData>,
  basedir: string,
  basename: string
): Promise<void> {
  try {
    const analyses = await mapSheet(
      [front, back],
      async ({ width, height, data }, side) => {
        const analysis = await analyzeScannedPage(
          grayImageFromRgbaImageData(width, height, data)
        );
        await writeFile(
          join(basedir, `${basename}-analysis-${side}.json`),
          JSON.stringify(analysis, null, 2)
        );
        return analysis;
      }
    );

    const analysisCsvPath = join(basedir, 'electrical-testing-analysis.csv');
    if (!(await exists(analysisCsvPath))) {
      await writeFile(analysisCsvPath, `${CSV_COLUMNS.join(',')}\n`);
    }

    for (const analysis of analyses) {
      const csvValues = [
        timestamp.toISO(),
        analysis.topLine.orientation,
        analysis.topLine.slope,
        analysis.topLine.intercept,
        analysis.topLine.errorAverage,
        analysis.bottomLine.orientation,
        analysis.bottomLine.slope,
        analysis.bottomLine.intercept,
        analysis.bottomLine.errorAverage,
        analysis.leftLine.orientation,
        analysis.leftLine.slope,
        analysis.leftLine.intercept,
        analysis.leftLine.errorAverage,
        analysis.rightLine.orientation,
        analysis.rightLine.slope,
        analysis.rightLine.intercept,
        analysis.rightLine.errorAverage,
        analysis.topLeftCorner.x,
        analysis.topLeftCorner.y,
        analysis.topRightCorner.x,
        analysis.topRightCorner.y,
        analysis.bottomLeftCorner.x,
        analysis.bottomLeftCorner.y,
        analysis.bottomRightCorner.x,
        analysis.bottomRightCorner.y,
        analysis.averageLineError,
        analysis.horizontalLinesAlignmentDiff,
        analysis.verticalLinesAlignmentDiff,
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

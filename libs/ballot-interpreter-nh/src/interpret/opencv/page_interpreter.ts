import makeDebug from 'debug';
import * as path from 'path';
import * as cv from '@u4/opencv4nodejs';

import {
  AdjudicationReason,
  BallotPaperSize,
  BallotType,
  ElectionDefinition,
  getBallotStyle,
  getContestsFromIds,
  InterpretedHmpbPage,
  MarkThresholds,
  ok,
  Result,
} from '@votingworks/types';
import { time } from '@votingworks/utils';
import { decodeTimingMarkBits } from '../../accuvote';
import { convertMarksToAdjudicationInfo } from '../convert_marks_to_adjudication_info';
import {
  BallotCardGeometry,
  FrontMarksMetadata,
  InterpretedOvalMark,
} from '../../types';
import { BallotMetadata, OpenCvInterpretResult } from './types';
import {
  decodeBitsFromBottomTimingMarks,
  getDistanceBetweenRects,
  toVxRect,
  toVxVector,
} from './utils';
import {
  BGR_BLUE,
  BGR_DARK_GREEN,
  BGR_GRAY,
  BGR_RED,
  IS_DEBUG_ENABLED,
} from './constants';
import { Page } from './page';
import { convertMarksToMarkInfo } from '../convert_marks_to_mark_info';
import { convertMarksToVotes } from '../convert_marks_to_votes';

const debugLogger = makeDebug(
  'ballot-interpreter-nh:interpret-opencv:PageInterpreter'
);

/**
 * OpenCV-powered ballot page interpreter
 */
export class PageInterpreter {
  constructor(
    private readonly electionDefinition: ElectionDefinition,
    private readonly geometry: BallotCardGeometry,
    private readonly isTestMode: boolean,
    private readonly paperSize: BallotPaperSize,
    private readonly adjudicationReasons: readonly AdjudicationReason[],
    private readonly markThresholds: MarkThresholds,
    private readonly ballotImagesPath: string,
    private readonly sheetId: string,

    // FIXME: see comment in opencv_interpreter.ts
    private readonly resolveBallotMetadataFn: (value: BallotMetadata) => void,
    private readonly ballotMetadataPromise: Promise<BallotMetadata>
  ) {}

  async run(
    imageFilePath: string,
    pageIndex: number
  ): Promise<Result<OpenCvInterpretResult, Error>> {
    const timer = time(debugLogger, `run:page-${pageIndex}`);

    const page = await Page.load({
      geometry: this.geometry,
      imageFilePath,
      pageIndex,
    });
    timer.checkpoint('loadedPage');

    const timingMarks = await page.findTimingMarks();
    timer.checkpoint('foundTimingMarks');

    const bits = decodeBitsFromBottomTimingMarks(timingMarks.bottom);
    timer.checkpoint('decodedBitsFromBottomMarks');

    const metadataResult = decodeTimingMarkBits(bits);
    if (metadataResult.isErr()) {
      throw new Error(
        `failed to decode bits | page ${pageIndex} | ${bits.join('')} | ` +
          `${metadataResult.err()}`
      );
    }

    const pageMetadata = metadataResult.ok();
    if (pageMetadata.side === 'front') {
      this.resolveBallotMetadataFn(this.buildBallotMetada(pageMetadata));
    }

    const ballotMetadata = await this.ballotMetadataPromise;

    timer.checkpoint('decodedMetadataFromTimingMarkBits');

    const gridPositions = ballotMetadata.gridLayout.gridPositions.filter(
      (p) => p.side === pageMetadata.side
    );

    const ovalMarks = await Promise.all(
      gridPositions.map(async (cell) => page.findOvalMark(timingMarks, cell))
    );

    timer.checkpoint('foundOvalMarks');

    const parts = path.parse(imageFilePath);
    const ext = parts.ext === '.png' ? '.png' : '.jpg';

    const originalImageFilePath = path.join(
      this.ballotImagesPath,
      `${path.basename(imageFilePath, ext)}-${this.sheetId}-original${ext}`
    );

    const normalizedImageFilePath = path.join(
      this.ballotImagesPath,
      `${path.basename(imageFilePath, ext)}-${this.sheetId}-normalized${ext}`
    );

    void page.saveImages({
      normalizedImageFilePath,
      originalImageFilePath,
    });

    timer.checkpoint('savedBallotImages');

    if (IS_DEBUG_ENABLED) {
      const debugImage = await page.getImage().cvtColorAsync(cv.COLOR_GRAY2BGR);
      for (const rect of [
        ...timingMarks.top.interpolated,
        ...timingMarks.left.interpolated,
        ...timingMarks.bottom.interpolated,
        ...timingMarks.right.interpolated,
      ]) {
        debugImage.drawRectangle(rect, BGR_RED);
      }
      const debugDrawPromises: Array<Promise<void>> = [];
      for (const oval of ovalMarks) {
        if (oval.expectedBounds.isOk()) {
          const expectedBounds = oval.expectedBounds.ok();

          debugImage.drawRectangle(expectedBounds, BGR_BLUE, 1);
        }

        if (oval.matchBounds.isOk()) {
          const matchBounds = oval.matchBounds.ok();

          debugImage.drawRectangle(matchBounds, BGR_DARK_GREEN, 2);

          debugDrawPromises.push(
            debugImage.putTextAsync(
              `${Math.round(oval.score * 100)}%`,
              new cv.Point2(matchBounds.x - 10, matchBounds.y - 20),
              cv.FONT_HERSHEY_PLAIN,
              2.5,
              {
                color: oval.score > 0.05 ? BGR_DARK_GREEN : BGR_GRAY,
                thickness: 2,
              }
            )
          );
        }
      }
      void Promise.all(debugDrawPromises).then(() =>
        cv.imwriteAsync(
          `/home/kofi-vxsuite/Desktop/debug-images/ovals-page-${pageIndex}.debug.jpeg`,
          debugImage,
          [cv.IMWRITE_JPEG_QUALITY]
        )
      );
    }

    const vxOvalMarks = ovalMarks
      .filter((m) => m.matchBounds.isOk())
      .map<InterpretedOvalMark>((m) => ({
        bounds: toVxRect(m.matchBounds.unsafeUnwrap()),
        gridPosition: m.gridPosition,
        score: m.score,
        scoredOffset: toVxVector(
          getDistanceBetweenRects(
            m.expectedBounds.unsafeUnwrap(),
            m.matchBounds.unsafeUnwrap()
          )
        ),
      }));

    const interpretation: InterpretedHmpbPage = {
      type: 'InterpretedHmpbPage',
      adjudicationInfo: convertMarksToAdjudicationInfo({
        contests: getContestsFromIds(
          this.electionDefinition.election,
          gridPositions.map((p) => p.contestId)
        ),
        enabledReasons: this.adjudicationReasons,
        markThresholds: this.markThresholds,
        ovalMarks: vxOvalMarks,
      }),
      markInfo: convertMarksToMarkInfo(this.geometry, vxOvalMarks),
      metadata: {
        ...ballotMetadata,
        locales: { primary: 'unknown' },
        pageNumber: pageIndex + 1,
      },
      votes: convertMarksToVotes(
        this.electionDefinition.election.contests,
        this.markThresholds,
        vxOvalMarks
      ),
    };

    timer.checkpoint('convertedResults');

    timer.end();

    return ok({
      interpretation,
      normalizedImageFilePath,
      originalImageFilePath,
    });
  }

  private buildBallotMetada(
    frontPageMetadata: FrontMarksMetadata
  ): BallotMetadata {
    const ballotStyleId = `card-number-${frontPageMetadata.cardNumber}`;
    const ballotStyle = getBallotStyle({
      election: this.electionDefinition.election,
      ballotStyleId,
    });

    if (!ballotStyle) {
      throw new Error(`no ballot style found for ${ballotStyleId}`);
    }

    const precinctId = ballotStyle.precincts[0];
    if (!precinctId) {
      throw new Error('no precinct found for ballot style');
    }

    const gridLayout = this.electionDefinition.election.gridLayouts?.find(
      (layout) => layout.ballotStyleId === ballotStyleId
    );

    if (!gridLayout) {
      throw new Error(
        `could not find grid layout for ballot style ID ${ballotStyleId}`
      );
    }

    return {
      ballotStyleId,
      ballotType: BallotType.Standard,
      electionHash: this.electionDefinition.electionHash,
      gridLayout,
      isTestMode: this.isTestMode,
      precinctId,
    };
  }
}

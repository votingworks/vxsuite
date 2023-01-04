import makeDebug from 'debug';
import * as cv from '@u4/opencv4nodejs';

import { assert, time } from '@votingworks/utils';
import { err, GridPosition, ok, Result } from '@votingworks/types';
import { BallotCardGeometry } from '../../types';
import {
  BGR_BLUE,
  BGR_GREEN,
  BGR_LIGHT_BLUE,
  BGR_RED,
  BGR_WHITE,
  GRAYSCALE_WHITE,
  IS_DEBUG_ENABLED,
  MAX_TIMING_MARK_MARGIN_TO_PAGE_SIZE_RATIO_X,
  MAX_TIMING_MARK_MARGIN_TO_PAGE_SIZE_RATIO_Y,
  MIN_TIMING_MARK_PAGE_OFFSET_INCHES,
  TIMING_MARK_CONTOUR_DETECTION_PADDING,
} from './constants';
import {
  binarizeImage,
  findMinOrMaxContour,
  getDistanceBetweenRects,
  getDistancesBetweenTimingMarks,
  getShadedPixelRatio,
  getRectCenter,
  mapMargins,
  estimateContourFillRatio,
  clamp,
} from './utils';
import {
  DetectedTimingMarks,
  MarginType,
  OvalMark,
  PageMargins,
  PageRegion,
  PotentialTimingMarks,
  TimingMarks,
} from './types';
import { median } from '../../utils';
import { ovalTemplatePromise } from './oval_template';

const debugLogger = makeDebug('ballot-interpreter-nh:interpret-opencv:Page');

/** Represents a scanned ballot page */
export class Page {
  private constructor(
    private readonly pageIndex: number,
    private readonly geometry: BallotCardGeometry,
    private readonly originalImage: cv.Mat,
    private readonly image: cv.Mat
  ) {}

  static async load(params: {
    geometry: BallotCardGeometry;
    imageFilePath: string;
    pageIndex: number;
  }): Promise<Page> {
    const { geometry, imageFilePath, pageIndex } = params;

    const timer = time(debugLogger, `loadPage:page-${pageIndex}`);

    const originalImage = await cv.imreadAsync(
      imageFilePath,
      cv.IMREAD_GRAYSCALE
    );

    timer.checkpoint('loadedPageImage');

    const scaleFactor = Math.min(
      geometry.canvasSize.width / originalImage.cols,
      geometry.canvasSize.height / originalImage.rows
    );
    const rescaledImage = await originalImage.rescaleAsync(scaleFactor);

    timer.checkpoint('resizedImage');

    const page = new Page(pageIndex, geometry, originalImage, rescaledImage);
    const optimizedPage = await page.tryFixDistortion();
    // const optimizedPage = page;

    timer.checkpoint('optimizedPage');

    timer.end();

    return optimizedPage;
  }

  getImage(): cv.Mat {
    return this.image;
  }

  async saveImages(paths: {
    normalizedImageFilePath: string;
    originalImageFilePath: string;
  }): Promise<void> {
    await Promise.all([
      cv.imwriteAsync(paths.originalImageFilePath, this.originalImage, [
        cv.IMWRITE_JPEG_QUALITY,
      ]),
      cv.imwriteAsync(paths.normalizedImageFilePath, this.image, [
        cv.IMWRITE_JPEG_QUALITY,
      ]),
    ]);
  }

  async findTimingMarks(): Promise<PageMargins<TimingMarks>> {
    const pageMarginImages = await this.getPageMarginImages();

    const pageMarginMarks = await mapMargins(
      pageMarginImages,
      (marginImage, marginType) =>
        this.findTimingMarksInMargin(marginImage, marginType)
    );

    const detectedMarks: PageMargins<DetectedTimingMarks> = await mapMargins(
      pageMarginMarks,
      (marks, marginType) => {
        const markRects = marks.map((m) => m.boundingRect());

        return Promise.resolve<DetectedTimingMarks>({
          marks,
          marginImage: pageMarginImages[marginType],
          medianHeight: median(markRects.map((m) => m.height)),
          medianSpacing: median(
            getDistancesBetweenTimingMarks(markRects).map((v) => v.norm())
          ),
          medianWidth: median(markRects.map((m) => m.width)),
          marginType,
        });
      }
    );

    // Use top timing mark spacing as reference for bottom, since the bottom
    // row is used to encode data and may be missing too many marks to allow
    // inferring the appropriate spacing.
    detectedMarks.bottom.medianSpacing =
      detectedMarks.top.medianSpacing -
      detectedMarks.top.medianWidth +
      detectedMarks.bottom.medianWidth;

    const results: PageMargins<TimingMarks> = await mapMargins(
      detectedMarks,
      async (marginMarks, marginType): Promise<TimingMarks> => {
        const interpolated = await this.interpolateMissingTimingMarks(
          marginMarks,
          marginType
        );
        const first = interpolated[0];
        const last = interpolated[interpolated.length - 1];
        assert(first);
        assert(last);

        return {
          detected: marginMarks.marks,
          first,
          interpolated,
          last,
          marginType,
          medianSpacing: marginMarks.medianSpacing,
        };
      }
    );

    return results;
  }

  async findOvalMark(
    timingMarks: PageMargins<TimingMarks>,
    cell: GridPosition
  ): Promise<OvalMark> {
    const { ovalSize } = this.geometry;

    const expectedBounds = this.findExpectedOvalBounds(
      timingMarks,
      cell.row,
      cell.column
    );
    if (expectedBounds.isErr()) {
      const errorMessage = `unable to find bubble location: ${expectedBounds.err()}`;

      const result: OvalMark = {
        gridPosition: cell,
        expectedBounds: err(errorMessage),
        matchBounds: err(errorMessage),
        searchBounds: err(errorMessage),
        score: 0,
      };
      return result;
    }

    const searchBounds = this.getOvalSearchBounds(expectedBounds.ok());

    const ovalTemplate = await ovalTemplatePromise;
    const ovalImageRegion = await this.getRegion(searchBounds);
    const matches = await ovalImageRegion.image.matchTemplateAsync(
      ovalTemplate.image,
      cv.TM_CCOEFF_NORMED
    );

    // FIXME: are maxLoc and maxVal always guaranteed to be defined?
    const { maxLoc: matchLocation, maxVal: matchProbability } =
      await matches.minMaxLocAsync();
    const markLocationInImage = matchLocation.add(
      new cv.Point2(searchBounds.x, searchBounds.y)
    );
    const matchBounds: Result<cv.Rect, string> =
      matchProbability === 0
        ? err('unable to find bubble in expected location')
        : ok(
            new cv.Rect(
              markLocationInImage.x,
              markLocationInImage.y,
              ovalSize.width,
              ovalSize.height
            )
          );

    let score = 0;
    if (matchBounds.isOk()) {
      // Pad the area around the match region to make binarization a bit
      // more accurate for the bubble outline and marks.
      const paddingSize = 100;
      const matchImageRegion = await this.getRegion({
        ...matchBounds.ok(),
        paddingSize,
      });
      const shadedPixelRatio = await getShadedPixelRatio(
        matchImageRegion.image,
        new cv.Rect(
          paddingSize,
          paddingSize,
          matchBounds.ok().width,
          matchBounds.ok().height
        )
      );

      score = Math.max(shadedPixelRatio - ovalTemplate.shadedPixelRatio, 0);
    }

    const result: OvalMark = {
      gridPosition: cell,
      expectedBounds,
      matchBounds,
      score,
      searchBounds: ok(searchBounds),
    };
    return result;
  }

  private async getPageMarginImages(): Promise<PageMargins<PageRegion>> {
    const { cols: pageWidth, rows: pageHeight } = this.image;

    const marginX = Math.round(
      pageWidth * MAX_TIMING_MARK_MARGIN_TO_PAGE_SIZE_RATIO_X
    );
    const marginY = Math.round(
      pageHeight * MAX_TIMING_MARK_MARGIN_TO_PAGE_SIZE_RATIO_Y
    );

    const [top, bottom, left, right] = await Promise.all([
      this.getRegion({
        x: 0,
        y: 0,
        width: pageWidth,
        height: marginY,
        paddingSize: TIMING_MARK_CONTOUR_DETECTION_PADDING,
      }),
      this.getRegion({
        x: 0,
        y: -marginY,
        width: pageWidth,
        height: marginY,
        paddingSize: TIMING_MARK_CONTOUR_DETECTION_PADDING,
      }),
      this.getRegion({
        x: 0,
        y: 0,
        width: marginX,
        height: pageHeight,
        paddingSize: TIMING_MARK_CONTOUR_DETECTION_PADDING,
      }),
      this.getRegion({
        x: -marginX,
        y: 0,
        width: marginX,
        height: pageHeight,
        paddingSize: TIMING_MARK_CONTOUR_DETECTION_PADDING,
      }),
    ]);

    return { top, right, bottom, left };
  }

  private async findTimingMarksInMargin(
    pageRegion: PageRegion,
    marginType: MarginType
  ): Promise<cv.Contour[]> {
    const { allContours, potentialMarks } = await this.findPotentialTimingMarks(
      pageRegion
    );

    const detected =
      marginType === 'top' || marginType === 'bottom'
        ? this.findHorizontalTimingMarks(potentialMarks)
        : this.findVerticalTimingMarks(potentialMarks);

    if (IS_DEBUG_ENABLED) {
      const debugImage = await this.image.cvtColorAsync(cv.COLOR_GRAY2BGR);

      for (const c of allContours) {
        debugImage.drawRectangle(c.boundingRect(), BGR_RED, 2);
      }
      for (const c of potentialMarks) {
        debugImage.drawRectangle(c.boundingRect(), BGR_LIGHT_BLUE, 2);
      }
      for (const c of detected) {
        debugImage.drawRectangle(c.boundingRect(), BGR_GREEN, 2);
      }

      await cv.imwriteAsync(
        `/home/kofi-vxsuite/Desktop/debug-images/margins-page-${this.pageIndex}-${marginType}-debug.jpeg`,
        debugImage,
        [cv.cv.IMWRITE_JPEG_QUALITY]
      );
    }

    return detected;
  }

  private async findPotentialTimingMarks(
    pageRegion: PageRegion
  ): Promise<PotentialTimingMarks> {
    const binarizedImage = await binarizeImage(pageRegion.image);

    const allContours = await binarizedImage.findContoursAsync(
      cv.RETR_LIST,
      cv.CHAIN_APPROX_SIMPLE,
      pageRegion.offset
    );

    const potentialMarks: cv.Contour[] = allContours.filter((c) =>
      this.couldContourBeTimingMark(c)
    );

    const result: PotentialTimingMarks = {
      allContours,
      potentialMarks,
    };

    return result;
  }

  private couldContourBeTimingMark(contour: cv.Contour): boolean {
    const { timingMarkSize } = this.geometry;
    const minMarkWidth = Math.floor(timingMarkSize.width * (1 / 4));
    const maxMarkWidth = Math.ceil(timingMarkSize.width * (3 / 2));
    const minMarkHeight = Math.floor(timingMarkSize.height * (4 / 5));
    const maxMarkHeight = Math.ceil(timingMarkSize.height * (3 / 2));

    const contourRect = contour.boundingRect();
    const { height, width } = contourRect;

    if (
      width < minMarkWidth ||
      width > maxMarkWidth ||
      height < minMarkHeight ||
      height > maxMarkHeight
    ) {
      return false;
    }

    // FIXME: modelled after sample opencv code - move to constant or function
    const maxDistanceFromActualToApproimatedPoint =
      contour.arcLength(true) * (4.125 / 100);
    const shapeApproximationPoints = contour.approxPolyDP(
      maxDistanceFromActualToApproimatedPoint,
      true
    );
    if (shapeApproximationPoints.length !== 4) {
      return false;
    }

    if (estimateContourFillRatio(contour) < 0.85) {
      return false;
    }

    return true;
  }

  private findHorizontalTimingMarks(
    potentialMarks: readonly cv.Contour[]
  ): cv.Contour[] {
    const sortedMarks = [...potentialMarks].sort(
      (a, b) => a.boundingRect().x - b.boundingRect().x
    );

    const medianMarkIndex = Math.floor(potentialMarks.length / 2);
    const medianMark = sortedMarks[medianMarkIndex];
    assert(medianMark);

    const medianMarkBounds = medianMark.boundingRect();

    // Filter out marks that are significantly off-axis from the median mark.
    // FIXME: Taking a shortcut here for prototyping sake.
    const detected = [...sortedMarks].filter((m) => {
      const markBounds = m.boundingRect();
      return Math.abs(markBounds.y - medianMarkBounds.y) < markBounds.height;
    });

    return detected;
  }

  private findVerticalTimingMarks(
    potentialMarks: readonly cv.Contour[]
  ): cv.Contour[] {
    const sortedMarks = [...potentialMarks].sort(
      (a, b) => a.boundingRect().y - b.boundingRect().y
    );

    const medianMarkIndex = Math.floor(potentialMarks.length / 2);
    const medianMark = sortedMarks[medianMarkIndex];
    assert(medianMark);

    const medianMarkBounds = medianMark.boundingRect();

    // Filter out marks that are significantly off-center from the median mark.
    // FIXME: Taking a shortcut here for prototyping sake.
    const detected = [...sortedMarks].filter((m) => {
      const markBounds = m.boundingRect();
      return (
        Math.abs(markBounds.x - medianMarkBounds.x) < markBounds.width * 0.8
      );
    });

    return detected;
  }

  private async interpolateMissingTimingMarks(
    detectedMarks: DetectedTimingMarks,
    marginType: MarginType
  ): Promise<cv.Rect[]> {
    const { medianSpacing } = detectedMarks;

    const interpolatedRects: cv.Rect[] = [];

    const firstMark = detectedMarks.marks[0];
    assert(firstMark);

    let previousRect = firstMark.boundingRect();
    interpolatedRects.push(previousRect);

    for (const detectedMark of detectedMarks.marks.slice(1)) {
      const currentRect = detectedMark.boundingRect();

      const distanceFromPrevious = getDistanceBetweenRects(
        previousRect,
        currentRect
      );

      if (distanceFromPrevious.norm() > medianSpacing * 1.5) {
        const numStepsFromPrevious = Math.round(
          distanceFromPrevious.norm() / medianSpacing
        );
        const stepVector = distanceFromPrevious.div(numStepsFromPrevious);
        const numMissingRects = numStepsFromPrevious - 1;
        const previousRectCenter = getRectCenter(previousRect);

        for (let i = 0; i < numMissingRects; i += 1) {
          const inferredRectHeight =
            (previousRect.height + currentRect.height) / 2;
          const inferredRectWidth =
            (previousRect.width + currentRect.width) / 2;

          // const previousRectCenter = getRectCenter(previousRect);
          const inferredRectOrigin = previousRectCenter
            // .add(stepVector)
            .add(stepVector.mul(i + 1))
            .sub(new cv.Point2(inferredRectWidth / 2, inferredRectHeight / 2));

          const inferredRect = new cv.Rect(
            clamp(inferredRectOrigin.x, 0, this.image.cols - inferredRectWidth),
            clamp(
              inferredRectOrigin.y,
              0,
              this.image.rows - inferredRectHeight
            ),
            inferredRectWidth,
            inferredRectHeight
          );

          if (marginType !== 'bottom') {
            const inferredMarkRegion = await this.getRegion(inferredRect);
            const shadedRatio = await getShadedPixelRatio(
              inferredMarkRegion.image
            );
            // FIXME: magic constant
            if (shadedRatio < 0.7) {
              continue;
            }
          }

          interpolatedRects.push(inferredRect);
          previousRect = inferredRect;
        }
      }

      interpolatedRects.push(currentRect);
      previousRect = currentRect;
    }

    return interpolatedRects;
  }

  private findExpectedOvalBounds(
    timingMarks: PageMargins<TimingMarks>,
    rowIndex: number,
    colIndex: number
  ): Result<cv.Rect, string> {
    if (
      colIndex >= timingMarks.bottom.interpolated.length ||
      colIndex >= timingMarks.top.interpolated.length
    ) {
      return err('invalid column index');
    }

    if (
      rowIndex >= timingMarks.left.interpolated.length ||
      rowIndex >= timingMarks.right.interpolated.length
    ) {
      return err('invalid row index');
    }

    const bottom = timingMarks.bottom.interpolated[colIndex];
    const left = timingMarks.left.interpolated[rowIndex];
    const right = timingMarks.right.interpolated[rowIndex];
    const top = timingMarks.top.interpolated[colIndex];

    assert(bottom);
    assert(left);
    assert(right);
    assert(top);

    const { x: x1, y: y1 } = getRectCenter(top);
    const { x: x2, y: y2 } = getRectCenter(bottom);

    const { x: x3, y: y3 } = getRectCenter(left);
    const { x: x4, y: y4 } = getRectCenter(right);

    const denominator = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
    if (denominator === 0) {
      return err('grid lines do not intersect');
    }

    const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denominator;
    const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denominator;

    if (ua < 0 || ua > 1 || ub < 0 || ub > 1) {
      return err('grid lines do not intersect within the page');
    }

    const ovalCenterX = x1 + ua * (x2 - x1);
    const ovalCenterY = y1 + ua * (y2 - y1);

    // Calculate the potential horizontal skew of the requested row so we can
    // nudge the x coordinates accordingly to account for some of the warp that
    // occurs while scanning.
    const topLeftMark = timingMarks.top.first;
    const gridRowHorizontalSkew =
      topLeftMark.x + topLeftMark.width - (left.x + left.width);

    const { height, width } = this.geometry.ovalSize;
    return ok(
      new cv.Rect(
        ovalCenterX - width / 2 - gridRowHorizontalSkew,
        ovalCenterY - height / 2,
        width,
        height
      )
    );
  }

  private getOvalSearchBounds(expectedOvalBounds: cv.Rect): cv.Rect {
    const { height, width, x, y } = expectedOvalBounds;

    const wiggleRoomX = 0.25 * width;
    const wiggleRoomY = 0.25 * height;
    const ovalAreaRect = new cv.Rect(
      x - wiggleRoomX / 2,
      y - wiggleRoomY / 2,
      width + wiggleRoomX,
      height + wiggleRoomY
    );

    return ovalAreaRect;
  }

  private async tryFixDistortion(): Promise<Page> {
    const timer = time(debugLogger, `tryFixDistortion:page-${this.pageIndex}`);

    const cornerWidth = this.image.cols * (9 / 100);
    const cornerHeight = this.image.rows * (12.5 / 100);

    const [topLeftImage, topRightImage, bottomRightImage, bottomLeftImage] =
      await Promise.all([
        this.getRegion({
          x: 0,
          y: 0,
          width: cornerWidth,
          height: cornerHeight,
          paddingSize: TIMING_MARK_CONTOUR_DETECTION_PADDING,
        }),
        this.getRegion({
          x: -cornerWidth,
          y: 0,
          width: cornerWidth,
          height: cornerHeight,
          paddingSize: TIMING_MARK_CONTOUR_DETECTION_PADDING,
        }),
        this.getRegion({
          x: -cornerWidth,
          y: -cornerHeight,
          width: cornerWidth,
          height: cornerHeight,
          paddingSize: TIMING_MARK_CONTOUR_DETECTION_PADDING,
        }),
        this.getRegion({
          x: 0,
          y: -cornerHeight,
          width: cornerWidth,
          height: cornerHeight,
          paddingSize: TIMING_MARK_CONTOUR_DETECTION_PADDING,
        }),
      ]);

    timer.checkpoint('croppedCornerImages');

    const [topLeftMarks, topRightMarks, bottomLeftMarks, bottomRightMarks] =
      await Promise.all([
        this.findPotentialTimingMarks(topLeftImage),
        this.findPotentialTimingMarks(topRightImage),
        this.findPotentialTimingMarks(bottomLeftImage),
        this.findPotentialTimingMarks(bottomRightImage),
      ]);

    const topLeftMark = findMinOrMaxContour(topLeftMarks.potentialMarks, {
      x: 'min',
      y: 'min',
    })
      .unsafeUnwrap()
      .boundingRect();
    const topRightMark = findMinOrMaxContour(topRightMarks.potentialMarks, {
      x: 'max',
      y: 'min',
    })
      .unsafeUnwrap()
      .boundingRect();
    const bottomLeftMark = findMinOrMaxContour(bottomLeftMarks.potentialMarks, {
      x: 'min',
      y: 'max',
    })
      .unsafeUnwrap()
      .boundingRect();
    const bottomRightMark = findMinOrMaxContour(
      bottomRightMarks.potentialMarks,
      { x: 'max', y: 'max' }
    )
      .unsafeUnwrap()
      .boundingRect();

    timer.checkpoint('foundCornerTimingMarks');

    if (IS_DEBUG_ENABLED) {
      const debugImage = await this.image.cvtColorAsync(cv.COLOR_GRAY2BGR);

      for (const c of [
        topLeftMarks.allContours,
        topRightMarks.allContours,
        bottomLeftMarks.allContours,
        bottomRightMarks.allContours,
      ].flat()) {
        debugImage.drawRectangle(c.boundingRect(), BGR_RED, 2);
      }
      for (const c of [
        topLeftMarks.potentialMarks,
        topRightMarks.potentialMarks,
        bottomLeftMarks.potentialMarks,
        bottomRightMarks.potentialMarks,
      ].flat()) {
        debugImage.drawRectangle(c.boundingRect(), BGR_BLUE, 2);
      }
      for (const c of [
        topLeftMark,
        topRightMark,
        bottomLeftMark,
        bottomRightMark,
      ]) {
        debugImage.drawRectangle(c, BGR_GREEN, 2);
      }

      await cv.imwriteAsync(
        `/home/kofi-vxsuite/Desktop/debug-images/corners-page-${this.pageIndex}-debug.jpeg`,
        debugImage,
        [cv.IMWRITE_JPEG_QUALITY]
      );
    }

    // Build source coordinates for the inner corners of the timing grid:
    const srcTopLeft = new cv.Point2(
      topLeftMark.x + topLeftMark.width,
      topLeftMark.y + topLeftMark.height
    );
    const srcTopRight = new cv.Point2(
      topRightMark.x,
      topRightMark.y + topRightMark.height
    );
    const srcBottomRight = new cv.Point2(bottomRightMark.x, bottomRightMark.y);
    const srcBottomLeft = new cv.Point2(
      bottomLeftMark.x + bottomLeftMark.width,
      bottomLeftMark.y
    );

    const srcMinX = Math.min(srcTopLeft.x, srcBottomLeft.x);
    const srcMaxX = Math.max(srcTopRight.x, srcBottomRight.x);
    const srcGridInnerWidth = srcMaxX - srcMinX;

    const srcMinY = Math.min(srcTopLeft.y, srcTopRight.y);
    const srcMaxY = Math.max(srcBottomLeft.y, srcBottomRight.y);
    const srcGridInnerHeight = srcMaxY - srcMinY;

    // Try to scale the image so the vertical timing marks are roughly at the
    // expected distance the edge of the page and are roughly the expected size.
    const markOffsetPx =
      MIN_TIMING_MARK_PAGE_OFFSET_INCHES * this.geometry.pixelsPerInch +
      this.geometry.timingMarkSize.width;
    const destMinX = markOffsetPx;
    const destMaxX = this.image.cols - markOffsetPx;
    const destGridInnerWidth = destMaxX - destMinX;

    const scaleFactor = destGridInnerWidth / srcGridInnerWidth;

    const destGridInnerHeight = srcGridInnerHeight * scaleFactor;
    const destMinY = (this.image.rows - destGridInnerHeight) / 2;
    const destMaxY = destMinY + destGridInnerHeight;

    const destTopLeft = new cv.Point2(destMinX, destMinY);
    const destTopRight = new cv.Point2(destMaxX, destMinY);
    const destBottomRight = new cv.Point2(destMaxX, destMaxY);
    const destBottomLeft = new cv.Point2(destMinX, destMaxY);

    const transformMatrix = cv.getPerspectiveTransform(
      [srcTopLeft, srcTopRight, srcBottomRight, srcBottomLeft],
      [destTopLeft, destTopRight, destBottomRight, destBottomLeft]
    );

    const deskewedImage = await this.image.warpPerspectiveAsync(
      transformMatrix,
      new cv.Size(this.image.cols, this.image.rows),
      cv.INTER_NEAREST,
      cv.BORDER_CONSTANT,
      BGR_WHITE
    );
    timer.checkpoint('deskewedImage');

    timer.end();

    return new Page(
      this.pageIndex,
      this.geometry,
      this.originalImage,
      deskewedImage
    );
  }

  /**
   * Returns a a crop of the specified region.
   * Negative values for {@link x} and {@link y} will result in negative offsets
   * from the image width and height, respectively.
   */
  private async getRegion(params: {
    height: number;
    width: number;
    x: number;
    y: number;
    paddingSize?: number;
  }): Promise<PageRegion> {
    const { height, width, x, y, paddingSize } = params;

    let offset = new cv.Point2(
      x < 0 ? this.image.cols + x : x,
      y < 0 ? this.image.rows + y : y
    );
    let image = this.image.getRegion(
      new cv.Rect(offset.x, offset.y, width, height)
    );
    // .copyAsync();

    if (paddingSize) {
      offset = offset.sub(new cv.Point2(paddingSize, paddingSize));

      image = await image.copyMakeBorderAsync(
        paddingSize,
        paddingSize,
        paddingSize,
        paddingSize,
        cv.BORDER_CONSTANT,
        GRAYSCALE_WHITE
      );
    }

    return { image, offset };
  }
}

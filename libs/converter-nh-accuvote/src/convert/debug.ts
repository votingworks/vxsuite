import {
  Geometry,
  Point,
  Rect,
  TimingMarkGrid,
  u32,
} from '@votingworks/ballot-interpreter';
import { assertDefined } from '@votingworks/basics';
import { PDFPage } from 'pdf-lib';

function gridPointCenter(
  topTimingMark: Rect,
  leftTimingMark: Rect
): Point<u32> {
  return {
    x: topTimingMark.left + topTimingMark.width / 2,
    y: leftTimingMark.top + leftTimingMark.height / 2,
  };
}

/**
 * Determines the PDF page coordinate value for the given grid pixel value.
 */
export function gridPixelValueDimensionToPdfPageCoordinateValue(
  geometry: Geometry,
  pixelValue: number
): number {
  const scale = 72 / geometry.pixelsPerInch;
  return pixelValue * scale;
}

function gridPixelPointToPdfPagePoint(
  pdfPage: PDFPage,
  geometry: Geometry,
  gridPixelPoint: Point<number>
): Point<number> {
  const x = gridPixelValueDimensionToPdfPageCoordinateValue(
    geometry,
    gridPixelPoint.x
  );
  const y = gridPixelValueDimensionToPdfPageCoordinateValue(
    geometry,
    gridPixelPoint.y
  );
  return { x, y: pdfPage.getHeight() - y };
}

/**
 * Returns the PDF page point for the given grid point. Use this for determining
 * the coordinates to draw PDF annotations based on the timing mark grid.
 */
export function getPdfPagePointForGridPoint(
  pdfPage: PDFPage,
  timingMarkGrid: TimingMarkGrid,
  gridPoint: Point<number>
): Point<number> {
  const topTimingMark = assertDefined(
    timingMarkGrid.completeTimingMarks.topRects[gridPoint.x]
  );
  const leftTimingMark = assertDefined(
    timingMarkGrid.completeTimingMarks.leftRects[gridPoint.y]
  );

  const gridPointCenterInGridPixels = gridPointCenter(
    topTimingMark,
    leftTimingMark
  );
  const gridPointCenterInPdfPage = gridPixelPointToPdfPagePoint(
    pdfPage,
    timingMarkGrid.geometry,
    gridPointCenterInGridPixels
  );

  return {
    x: gridPointCenterInPdfPage.x,
    y: gridPointCenterInPdfPage.y,
  };
}

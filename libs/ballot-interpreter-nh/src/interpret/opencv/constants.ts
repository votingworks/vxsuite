import * as cv from '@u4/opencv4nodejs';

/** FIXME: remove after prototyping */
export const IS_DEBUG_ENABLED = false;

/**
 * FIXME: guesstimate just for prototyping purposes - maybe move to ballot paper
 * size config.
 */
export const MIN_TIMING_MARK_PAGE_OFFSET_INCHES = 0.05;

/** TODO */
export const MAX_TIMING_MARK_MARGIN_TO_PAGE_SIZE_RATIO_X = 3.5 / 100;

/** TODO */
export const MAX_TIMING_MARK_MARGIN_TO_PAGE_SIZE_RATIO_Y = 6 / 100;

/** TODO */
export const TIMING_MARK_CONTOUR_DETECTION_PADDING = 25;

/** TODO */
export const BGR_BLUE = new cv.Vec3(255, 0, 0);

/** TODO */
export const BGR_LIGHT_BLUE = new cv.Vec3(255, 120, 120);

/** TODO */
export const BGR_GRAY = new cv.Vec3(96, 96, 96);

/** TODO */
export const BGR_GREEN = new cv.Vec3(0, 255, 0);

/** TODO */
export const BGR_DARK_GREEN = new cv.Vec3(0, 128, 0);

/** TODO */
export const BGR_RED = new cv.Vec3(0, 0, 255);

/** TODO */
export const BGR_WHITE = new cv.Vec3(255, 255, 255);

/** TODO */
export const GRAYSCALE_BLACK = 0;

/** TODO */
export const GRAYSCALE_WHITE = 255;

import {
  DEFAULT_MARGIN_DIMENSIONS,
  MarginDimensions,
} from '@votingworks/printing';

/**
 * While loaded, the paper must be fed through the paper output slot with the
 * tear bar. There is a distance between the output slot and the printhead, however,
 * which means that a certain chunk at the top of each page is unprintable. To
 * account for this, we redistribute a certain amount of the top margin to the
 * bottom margin. This must be calibrated based off of the hardware.
 */
const VERTICAL_MARGIN_ADJUSTMENT_INCHES = 0.32;
const ADJUSTED_TOP_MARGIN = Math.max(
  DEFAULT_MARGIN_DIMENSIONS.top - VERTICAL_MARGIN_ADJUSTMENT_INCHES,
  0
);
const ADJUSTED_BOTTOM_MARGIN = Math.max(
  DEFAULT_MARGIN_DIMENSIONS.bottom + VERTICAL_MARGIN_ADJUSTMENT_INCHES,
  0
);
export const ADJUSTED_MARGIN_DIMENSIONS: MarginDimensions = {
  ...DEFAULT_MARGIN_DIMENSIONS,
  top: ADJUSTED_TOP_MARGIN,
  bottom: ADJUSTED_BOTTOM_MARGIN,
};

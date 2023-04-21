import { safeParseJson } from '@votingworks/types';
import { GridLocation, TimingMarkGrid } from './types';
// eslint-disable-next-line import/no-unresolved -- this is a native addon
import { findTargetOvalsInTemplate as findTargetOvalsImpl } from './rust-addon';

/**
 * This value was experimentally determined to be the minimum score for an
 * oval to be considered a real oval.
 */
const DefaultTemplateOvalMatchScoreThreshold = 0.95;

/**
 * Find the target ovals in the given ballot template image.
 */
export function findTargetOvalsInTemplate(
  ballotImage: string | ImageData,
  ovalTemplateImage: string | ImageData,
  grid: TimingMarkGrid,
  ovalMatchThreshold = DefaultTemplateOvalMatchScoreThreshold
): GridLocation[] {
  return safeParseJson(
    findTargetOvalsImpl(
      ballotImage,
      ovalTemplateImage,
      JSON.stringify(grid),
      ovalMatchThreshold
    ).targetOvalsJson
  ).unsafeUnwrap() as GridLocation[];
}

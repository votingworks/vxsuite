// eslint-disable-next-line import/no-unresolved -- this is a native addon
import { findGrid as findGridImpl } from './rust-addon';
import { TimingMarkGrid } from './types';

/**
 * Result of calling {@link findGrid}.
 */
export interface FindGridResult {
  grid: TimingMarkGrid;
  normalizedImage?: ImageData;
}

/**
 * Finds the grid layout within a ballot image, returning both the grid layout
 * and a normalized image.
 */
export function findGrid(
  ballotImage: string,
  options?: { template?: boolean; debug?: boolean }
): FindGridResult;
/**
 * Finds the grid layout within a ballot image, returning both the grid layout
 * and a normalized image.
 */
export function findGrid(
  ballotImage: ImageData,
  options?: { template?: boolean; debugPath?: string }
): FindGridResult;
/**
 * Finds the grid layout within a ballot image, returning both the grid layout
 * and a normalized image. If the image is for a ballot template rather than
 * a ballot scan, set `template` to `true`.
 */
export function findGrid(
  ballotImage: string | ImageData,
  options:
    | { debug?: boolean; template?: boolean }
    | { debugPath?: string; template?: boolean } = {}
): FindGridResult {
  const debugPath =
    'debugPath' in options
      ? options.debugPath
      : 'debug' in options && options.debug && typeof ballotImage === 'string'
      ? ballotImage
      : undefined;
  const { gridJson, normalizedImage } = findGridImpl(
    ballotImage,
    options.template ?? false,
    debugPath
  );
  return {
    grid: JSON.parse(gridJson),
    normalizedImage,
  };
}

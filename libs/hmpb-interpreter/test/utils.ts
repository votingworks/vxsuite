import { Rect } from '@votingworks/types';
import { assert } from "@votingworks/utils";
import { randomBytes } from 'crypto';
import { createImageData } from '../src/utils/canvas';

export function randomImage({
  width = 0,
  height = 0,
  minWidth = 1,
  maxWidth = 10,
  minHeight = 1,
  maxHeight = 10,
  channels = 4,
} = {}): ImageData {
  if (!width) {
    assert(minWidth <= maxWidth);

    return randomImage({
      width: Math.max(
        1,
        (minWidth + Math.random() * (maxWidth - minWidth + 1)) | 0
      ),
      height,
      minWidth,
      maxWidth,
      minHeight,
      maxHeight,
      channels,
    });
  }
  if (!height) {
    assert(minHeight <= maxHeight);

    return randomImage({
      width,
      height: Math.max(
        1,
        (minHeight + Math.random() * (maxHeight - minHeight + 1)) | 0
      ),
      minWidth,
      maxWidth,
      minHeight,
      maxHeight,
      channels,
    });
  }
  assert(width >= 0);
  assert(height >= 0);
  const data = new Uint8ClampedArray(randomBytes(width * height * channels));
  return createImageData(data, width, height);
}

export function randomInt(
  min = Number.MIN_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER
): number {
  assert(min <= max);
  return (min + Math.random() * (max - min + 1)) | 0;
}

export function randomInset(
  rect: Rect,
  { min = 0, max = Math.min(rect.width, rect.height) } = {}
): Rect {
  assert(min >= 0);
  assert(max >= min);

  const leftInset =
    Math.max(min, Math.min(max, rect.width / 2 - 1, randomInt(min, max))) | 0;
  const rightInset =
    Math.max(min, Math.min(max, rect.width / 2 - 1, randomInt(min, max))) | 0;
  const topInset =
    Math.max(min, Math.min(max, rect.height / 2 - 1, randomInt(min, max))) | 0;
  const bottomInset =
    Math.max(min, Math.min(max, rect.height / 2 - 1, randomInt(min, max))) | 0;

  assert(rect.width - leftInset - rightInset > 0);
  assert(rect.height - topInset - bottomInset > 0);

  return {
    x: rect.x + leftInset,
    y: rect.y + topInset,
    width: rect.width - leftInset - rightInset,
    height: rect.height - topInset - bottomInset,
  };
}

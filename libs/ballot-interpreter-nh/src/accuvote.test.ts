import { unsafeParse } from '@votingworks/types';
import { assert } from '@votingworks/utils';
import { join } from 'path';
import {
  decodeFrontTimingMarkBits,
  findTimingMarks,
  scanForTimingMarksByScoringBlocks,
} from './accuvote';
import { withSvgDebugger } from './debug';
import { readGrayscaleImage } from './images';
import { decodeBottomRowTimingMarks } from './timing_marks';
import { FrontMarksMetadataSchema } from './types';

test('hudson p1 front', async () => {
  const imageData = await readGrayscaleImage(
    join(__dirname, '../test/fixtures/hudson_p1.jpg')
  );
  const rects = withSvgDebugger((debug) => {
    debug.imageData(0, 0, imageData);
    return scanForTimingMarksByScoringBlocks(imageData, {
      minimumScore: 0.75,
      debug,
    });
  });
  const timingMarks = withSvgDebugger((debug) => {
    debug.imageData(0, 0, imageData);
    return findTimingMarks({
      canvasSize: { width: imageData.width, height: imageData.height },
      rects,
      debug,
    });
  });
  assert(timingMarks, 'findTimingMarks failed');

  expect(timingMarks.topLeft).toBeDefined();
  expect(timingMarks.topRight).toBeDefined();
  expect(timingMarks.bottomLeft).toBeDefined();
  expect(timingMarks.bottomRight).toBeDefined();
  expect(timingMarks.left).toHaveLength(53);
  expect(timingMarks.right).toHaveLength(53);
  expect(timingMarks.top).toHaveLength(34);
  expect(timingMarks.bottom).toHaveLength(12);

  const bits = decodeBottomRowTimingMarks(timingMarks);
  assert(bits, 'decodeBottomRowTimingMarks failed');
  bits.reverse(); // make LSB first

  const metadata = decodeFrontTimingMarkBits(bits);
  expect(metadata).toEqual({
    batchOrPrecinctNumber: 53,
    bits: [
      1, 0, 1, 0, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 1,
    ],
    cardNumber: 54,
    computedMod4CheckSum: 1,
    mod4CheckSum: 1,
    sequenceNumber: 0,
    startBit: 1,
  });
  unsafeParse(FrontMarksMetadataSchema, metadata);
});

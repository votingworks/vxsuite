import { expect, test } from 'vitest';
import type { ScoredPositionArea } from './bubble-ballot-ts/types.js';
import { writeInAreaInkMm2 } from './write_in_area_ink.js';

function scoredArea(
  score: number,
  width: number,
  height: number
): ScoredPositionArea {
  return {
    gridPosition: {
      type: 'write-in',
      sheetNumber: 1,
      side: 'front',
      column: 1,
      row: 1,
      contestId: 'contest',
      writeInIndex: 0,
      writeInArea: { x: 2, y: 1, width, height },
    },
    score,
    shape: {
      topLeft: { x: 100, y: 100 },
      topRight: { x: 500, y: 100 },
      bottomLeft: { x: 100, y: 150 },
      bottomRight: { x: 500, y: 150 },
    },
  };
}

test('writeInAreaInkMm2 scales the score by the physical area', () => {
  // 7.8×1.0 grid units is 49.53mm × 6.35mm
  expect(writeInAreaInkMm2(scoredArea(0.025, 7.8, 1))).toBeCloseTo(7.863, 3);
  expect(writeInAreaInkMm2(scoredArea(1, 4, 4))).toBeCloseTo(645.16, 2);
  expect(writeInAreaInkMm2(scoredArea(0, 7.8, 1))).toEqual(0);
});

test('writeInAreaInkMm2 rejects a non-write-in position', () => {
  const area = scoredArea(0.5, 7.8, 1);
  expect(() =>
    writeInAreaInkMm2({
      ...area,
      gridPosition: {
        type: 'option',
        sheetNumber: 1,
        side: 'front',
        column: 1,
        row: 1,
        contestId: 'contest',
        optionId: 'option',
      },
    })
  ).toThrow();
});

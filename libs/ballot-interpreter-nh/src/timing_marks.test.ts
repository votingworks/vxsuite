import { unsafeParse } from '@votingworks/types';
import { assert, typedAs } from '@votingworks/utils';
import {
  generateTemplateTimingMarkRects,
  Hudson03Nov2020BackPageBottomTimingMarkBits,
  Hudson03Nov2020FrontPageBottomTimingMarkBits,
} from '../test/fixtures';
import { testImageDebugger } from '../test/utils';
import {
  decodeBackTimingMarkBits,
  decodeFrontTimingMarkBits,
} from './accuvote';
import {
  BestFitLineSegmentResult,
  computeTimingMarkGrid,
  decodeBottomRowTimingMarks,
  findBestFitLineSegmentThrough,
  interpolateMissingRects,
  renderTimingMarks,
} from './timing_marks';
import {
  BackMarksMetadata,
  BackMarksMetadataSchema,
  FrontMarksMetadataSchema,
  PartialTimingMarks,
  Rect,
  Size,
  ThirtyTwoBits,
} from './types';
import { loc, makeRect } from './utils';

test('interpolateMissingRects no rects', () => {
  expect(interpolateMissingRects([])).toEqual([]);
});

test('interpolateMissingRects one rect', () => {
  expect(
    interpolateMissingRects([makeRect({ minX: 0, minY: 0, maxX: 1, maxY: 1 })])
  ).toEqual([makeRect({ minX: 0, minY: 0, maxX: 1, maxY: 1 })]);
});

test('interpolateMissingRects infer one missing rect', () => {
  expect(
    interpolateMissingRects([
      makeRect({ minX: 0, minY: 0, maxX: 1, maxY: 1 }),
      makeRect({ minX: 0, minY: 2, maxX: 1, maxY: 3 }),
      makeRect({ minX: 0, minY: 4, maxX: 1, maxY: 5 }),
      makeRect({ minX: 0, minY: 8, maxX: 1, maxY: 9 }),
    ])
  ).toEqual([
    makeRect({ minX: 0, minY: 0, maxX: 1, maxY: 1 }),
    makeRect({ minX: 0, minY: 2, maxX: 1, maxY: 3 }),
    makeRect({ minX: 0, minY: 4, maxX: 1, maxY: 5 }),
    makeRect({ minX: 0, minY: 6, maxX: 1, maxY: 7 }),
    makeRect({ minX: 0, minY: 8, maxX: 1, maxY: 9 }),
  ]);
});

test('interpolateMissingRects infer multiple missing rects in a row', () => {
  const debug = testImageDebugger({ width: 200, height: 200 });
  expect(
    interpolateMissingRects(
      [
        makeRect({ minX: 10, minY: 10, maxX: 20, maxY: 20 }),
        makeRect({ minX: 10, minY: 30, maxX: 20, maxY: 40 }),
        makeRect({ minX: 10, minY: 50, maxX: 20, maxY: 60 }),
        makeRect({ minX: 10, minY: 70, maxX: 20, maxY: 80 }),
        makeRect({ minX: 10, minY: 90, maxX: 20, maxY: 100 }),
        makeRect({ minX: 10, minY: 150, maxX: 20, maxY: 160 }),
      ],
      { debug }
    )
  ).toEqual([
    makeRect({ minX: 10, minY: 10, maxX: 20, maxY: 20 }),
    makeRect({ minX: 10, minY: 30, maxX: 20, maxY: 40 }),
    makeRect({ minX: 10, minY: 50, maxX: 20, maxY: 60 }),
    makeRect({ minX: 10, minY: 70, maxX: 20, maxY: 80 }),
    makeRect({ minX: 10, minY: 90, maxX: 20, maxY: 100 }),
    makeRect({ minX: 10, minY: 110, maxX: 20, maxY: 120 }),
    makeRect({ minX: 10, minY: 130, maxX: 20, maxY: 140 }),
    makeRect({ minX: 10, minY: 150, maxX: 20, maxY: 160 }),
  ]);
});

test('findBestFitLineSegmentThrough no rects', () => {
  expect(
    findBestFitLineSegmentThrough({
      canvasSize: { width: 10, height: 10 },
      rects: [],
    })
  ).toBeUndefined();
});

test('findBestFitLineSegmentThrough single rect', () => {
  expect(
    findBestFitLineSegmentThrough({
      canvasSize: { width: 10, height: 10 },
      rects: [makeRect({ minX: 0, minY: 0, maxX: 1, maxY: 1 })],
    })
  ).toBeUndefined();
});

test('findBestFitLineSegmentThrough two rects', () => {
  const rects = [
    makeRect({ minX: 0, minY: 0, maxX: 100, maxY: 100 }),
    makeRect({ minX: 0, minY: 200, maxX: 100, maxY: 300 }),
  ];
  const canvasSize: Size = { width: 1000, height: 1000 };
  const debug = testImageDebugger(canvasSize);
  expect(
    findBestFitLineSegmentThrough({
      canvasSize,
      rects,
      debug,
    })
  ).toEqual(
    typedAs<BestFitLineSegmentResult>({
      lineSegment: {
        from: loc(50, 999),
        to: loc(50, 0),
      },
      rects,
    })
  );
});

test('findBestFitLineSegmentThrough ignores outliers', () => {
  const rects = [
    makeRect({ minX: 0, minY: 0, maxX: 100, maxY: 100 }),
    makeRect({ minX: 0, minY: 200, maxX: 100, maxY: 300 }),
    makeRect({ minX: 200, minY: 200, maxX: 300, maxY: 300 }),
    makeRect({ minX: 0, minY: 400, maxX: 100, maxY: 500 }),
  ];
  const canvasSize: Size = { width: 1000, height: 1000 };
  const debug = testImageDebugger(canvasSize);
  expect(
    findBestFitLineSegmentThrough({
      canvasSize,
      rects,
      debug,
    })
  ).toEqual(
    typedAs<BestFitLineSegmentResult>({
      lineSegment: {
        from: loc(50, 999),
        to: loc(50, 0),
      },
      rects: [...rects].filter((r) => r.minX === 0),
    })
  );
});

test('findBestFitLineSegmentThrough prefers centers', () => {
  const generated = generateTemplateTimingMarkRects();
  const rectToClone = generated.complete.left[2] as Rect;
  const phantomRect = makeRect({
    minX: rectToClone.minX + rectToClone.width / 2 + 1,
    minY: rectToClone.minY,
    maxX: rectToClone.maxX + rectToClone.width / 2 + 1,
    maxY: rectToClone.maxY,
  });

  const debug = testImageDebugger(generated.canvasSize);
  const fitResult = findBestFitLineSegmentThrough({
    canvasSize: generated.canvasSize,
    rects: [...generated.complete.left.slice(0, 10), phantomRect],
    debug,
  });

  expect(fitResult?.rects).not.toContain(phantomRect);
  expect(fitResult?.rects.length).toEqual(10);
});

test('decodeBottomRowTimingMarks no marks', () => {
  expect(
    decodeBottomRowTimingMarks({
      left: [],
      right: [],
      top: [],
      bottom: [],
    })
  ).toBeUndefined();
});

test('decodeBottomRowTimingMarks letter-size paper back side', () => {
  const generated = generateTemplateTimingMarkRects();
  const bottomBits = Hudson03Nov2020BackPageBottomTimingMarkBits;
  expect(generated.complete.bottom.length).toEqual(bottomBits.length + 2);

  const bottomRectsToRemove = generated.complete.bottom.filter(
    (r, i) => i > 0 && bottomBits[bottomBits.length - i] === 0
  );

  const expectedTimingMarks: PartialTimingMarks = {
    ...generated.complete,
    bottom: generated.complete.bottom.filter(
      (r) => !bottomRectsToRemove.includes(r)
    ),
  };

  const debug = testImageDebugger(generated.canvasSize);
  renderTimingMarks(debug, expectedTimingMarks);

  const bits = decodeBottomRowTimingMarks(expectedTimingMarks);
  assert(bits);
  bits.reverse(); // make LSB first

  expect(bits).toEqual(bottomBits);
  const metadata = decodeBackTimingMarkBits(bits);
  expect(metadata).toEqual(
    typedAs<BackMarksMetadata>({
      side: 'back',
      bits: bits as unknown as ThirtyTwoBits,
      electionDay: 3,
      electionMonth: 11,
      electionType: 'G',
      electionYear: 20,
      enderCode: [0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0],
      expectedEnderCode: [0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0],
    })
  );
  unsafeParse(BackMarksMetadataSchema, metadata);
});

test('decodeBottomRowTimingMarks letter-size paper front side', () => {
  const generated = generateTemplateTimingMarkRects();
  const bottomBits = Hudson03Nov2020FrontPageBottomTimingMarkBits;
  expect(generated.complete.bottom.length).toEqual(bottomBits.length + 2);

  const bottomRectsToRemove = generated.complete.bottom.filter(
    (r, i) => i > 0 && bottomBits[bottomBits.length - i] === 0
  );

  const expectedTimingMarks: PartialTimingMarks = {
    ...generated.complete,
    bottom: generated.complete.bottom.filter(
      (r) => !bottomRectsToRemove.includes(r)
    ),
  };

  const debug = testImageDebugger(generated.canvasSize);
  renderTimingMarks(debug, expectedTimingMarks);

  const bits = decodeBottomRowTimingMarks(expectedTimingMarks);
  assert(bits);
  bits.reverse(); // make LSB first

  expect(bits).toEqual(bottomBits);

  const decoded = decodeFrontTimingMarkBits(bits);
  unsafeParse(FrontMarksMetadataSchema, decoded);
});

test('computeTimingMarkGrid legal-size ballot card', () => {
  const generated = generateTemplateTimingMarkRects();
  const debug = testImageDebugger(generated.canvasSize);
  const grid = computeTimingMarkGrid(generated.complete, {
    debug,
  });
  expect(grid.rows).toHaveLength(generated.complete.left.length);
  for (const row of grid.rows) {
    expect(row).toHaveLength(generated.complete.top.length);
  }
});

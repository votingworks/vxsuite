import { unsafeParse } from '@votingworks/types';
import { assert, typedAs } from '@votingworks/utils';
import {
  generateTemplateTimingMarkRects,
  HudsonBackPageBottomTimingMarkBits,
  HudsonFrontPageBottomTimingMarkBits,
  LetterTemplateCanvasSize,
  noDebug,
} from '../test/fixtures';
import {
  decodeBackTimingMarkBits,
  decodeFrontTimingMarkBits,
} from './accuvote';
import { withSvgDebugger } from './debug';
import {
  BestFitLineSegmentResult,
  computeTimingMarkGrid,
  decodeBottomRowTimingMarks,
  findBestFitLineSegmentThrough,
  findBorder,
  interpolateMissingRects,
  interpolateMissingTimingMarks,
  renderTimingMarks,
} from './timing_marks';
import {
  BackMarksMetadataSchema,
  CompleteTimingMarks,
  FrontMarksMetadataSchema,
  PartialTimingMarks,
  Rect,
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
  expect(
    withSvgDebugger((debug) =>
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
  const rects = new Set([
    makeRect({ minX: 0, minY: 0, maxX: 100, maxY: 100 }),
    makeRect({ minX: 0, minY: 200, maxX: 100, maxY: 300 }),
  ]);
  expect(
    withSvgDebugger((debug) =>
      findBestFitLineSegmentThrough({
        canvasSize: { width: 1000, height: 1000 },
        rects,
        debug,
      })
    )
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
  const rects = new Set([
    makeRect({ minX: 0, minY: 0, maxX: 100, maxY: 100 }),
    makeRect({ minX: 0, minY: 200, maxX: 100, maxY: 300 }),
    makeRect({ minX: 200, minY: 200, maxX: 300, maxY: 300 }),
    makeRect({ minX: 0, minY: 400, maxX: 100, maxY: 500 }),
  ]);
  expect(
    withSvgDebugger((debug) =>
      findBestFitLineSegmentThrough({
        canvasSize: { width: 1000, height: 1000 },
        rects,
        debug,
      })
    )
  ).toEqual(
    typedAs<BestFitLineSegmentResult>({
      lineSegment: {
        from: loc(50, 999),
        to: loc(50, 0),
      },
      rects: new Set([...rects].filter((r) => r.minX === 0)),
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

  const fitResult = withSvgDebugger((debug) =>
    findBestFitLineSegmentThrough({
      canvasSize: generated.canvasSize,
      rects: [...generated.complete.left.slice(0, 10), phantomRect],
      debug,
    })
  );

  expect(fitResult?.rects).not.toContain(phantomRect);
  expect(fitResult?.rects.size).toBe(10);
});

test('findBorder no rects', () => {
  expect(
    findBorder({ canvasSize: { width: 10, height: 10 }, rects: [] })
  ).toBeUndefined();
});

test('findBorder minimal border', () => {
  expect(
    findBorder({
      canvasSize: { width: 10, height: 10 },
      rects: [
        makeRect({ minX: 1, minY: 1, maxX: 2, maxY: 2 }),
        makeRect({ minX: 7, minY: 1, maxX: 8, maxY: 2 }),
        makeRect({ minX: 1, minY: 7, maxX: 2, maxY: 8 }),
        makeRect({ minX: 7, minY: 7, maxX: 8, maxY: 8 }),
      ],
    })
  ).toEqual(
    typedAs<PartialTimingMarks>({
      left: [
        makeRect({ minX: 1, minY: 1, maxX: 2, maxY: 2 }),
        makeRect({ minX: 1, minY: 7, maxX: 2, maxY: 8 }),
      ],
      right: [
        makeRect({ minX: 7, minY: 1, maxX: 8, maxY: 2 }),
        makeRect({ minX: 7, minY: 7, maxX: 8, maxY: 8 }),
      ],
      top: [
        makeRect({ minX: 1, minY: 1, maxX: 2, maxY: 2 }),
        makeRect({ minX: 7, minY: 1, maxX: 8, maxY: 2 }),
      ],
      bottom: [
        makeRect({ minX: 1, minY: 7, maxX: 2, maxY: 8 }),
        makeRect({ minX: 7, minY: 7, maxX: 8, maxY: 8 }),
      ],
      topLeft: makeRect({ minX: 1, minY: 1, maxX: 2, maxY: 2 }),
      topRight: makeRect({ minX: 7, minY: 1, maxX: 8, maxY: 2 }),
      bottomLeft: makeRect({ minX: 1, minY: 7, maxX: 2, maxY: 8 }),
      bottomRight: makeRect({ minX: 7, minY: 7, maxX: 8, maxY: 8 }),
    })
  );
});

test('findBorder letter-size paper', () => {
  const generated = generateTemplateTimingMarkRects();

  expect(
    findBorder({
      canvasSize: LetterTemplateCanvasSize,
      rects: generated.allRects,
      debug: noDebug(),
    })
  ).toEqual(generated.complete);
});

test('findBorder letter-size paper with some missing bottom marks', () => {
  const generated = generateTemplateTimingMarkRects();
  const bottomPattern = HudsonBackPageBottomTimingMarkBits;
  assert(bottomPattern.length + 2 === generated.complete.bottom.length);
  const bottomRectsToRemove = generated.complete.bottom.filter(
    (r, i) => i > 0 && bottomPattern[i - 1] === 0
  );

  expect(
    withSvgDebugger((debug) =>
      findBorder({
        canvasSize: LetterTemplateCanvasSize,
        rects: generated.allRects.filter(
          (r) => !bottomRectsToRemove.includes(r)
        ),
        debug,
      })
    )
  ).toEqual(
    typedAs<PartialTimingMarks>({
      ...generated.complete,
      bottom: generated.complete.bottom.filter(
        (r) => !bottomRectsToRemove.includes(r)
      ),
    })
  );
});

test('findBorder letter-size paper with some random missing marks', () => {
  const generated = generateTemplateTimingMarkRects();
  const corners = [
    generated.complete.topLeft,
    generated.complete.topRight,
    generated.complete.bottomLeft,
    generated.complete.bottomRight,
  ];

  // keep about 80% of the marks plus the corners
  const filtered = generated.allRects.filter(
    (r) => Math.random() < 0.8 && !corners.includes(r)
  );
  const partialTimingMarks = withSvgDebugger((debug) =>
    findBorder({
      canvasSize: LetterTemplateCanvasSize,
      rects: [...filtered, ...corners],
      debug,
    })
  );
  assert(partialTimingMarks);

  expect(
    [
      ...partialTimingMarks.left,
      ...partialTimingMarks.right,
      ...partialTimingMarks.top,
      ...partialTimingMarks.bottom,
    ].filter((r) => !corners.includes(r))
  ).toHaveLength(filtered.length);

  withSvgDebugger((debug) =>
    interpolateMissingTimingMarks(partialTimingMarks, { debug })
  );
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
  const bottomBits = HudsonBackPageBottomTimingMarkBits;
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

  withSvgDebugger((debug) => renderTimingMarks(debug, expectedTimingMarks));

  const bits = decodeBottomRowTimingMarks(expectedTimingMarks);
  assert(bits);
  bits.reverse(); // make LSB first

  expect(bits).toEqual(bottomBits);
  const metadata = decodeBackTimingMarkBits(bits);
  expect(metadata).toEqual({
    bits,
    electionDay: 3,
    electionMonth: 11,
    electionType: 'G',
    electionYear: 20,
    enderCode: [0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0],
    expectedEnderCode: [0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0],
  });
  unsafeParse(BackMarksMetadataSchema, metadata);
});

test('decodeBottomRowTimingMarks letter-size paper front side', () => {
  const generated = generateTemplateTimingMarkRects();
  const bottomBits = HudsonFrontPageBottomTimingMarkBits;
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

  withSvgDebugger((debug) => renderTimingMarks(debug, expectedTimingMarks));

  const bits = decodeBottomRowTimingMarks(expectedTimingMarks);
  assert(bits);
  bits.reverse(); // make LSB first

  expect(bits).toEqual(bottomBits);

  const decoded = decodeFrontTimingMarkBits(bits);
  unsafeParse(FrontMarksMetadataSchema, decoded);
});

test('decodeBottomRowTimingMarks letter-size paper back side rotated', () => {
  const generated = generateTemplateTimingMarkRects();
  const bottomPattern = HudsonBackPageBottomTimingMarkBits;
  assert(bottomPattern.length + 2 === generated.complete.top.length);
  const topRectsToRemove = generated.complete.top.filter(
    (r, i) => i > 0 && bottomPattern[bottomPattern.length - i] === 0
  );

  const expectedTimingMarks: PartialTimingMarks = {
    left: generated.complete.right,
    right: generated.complete.left,
    top: generated.complete.bottom,
    bottom: generated.complete.top.filter((r) => !topRectsToRemove.includes(r)),
    topLeft: generated.complete.bottomRight,
    topRight: generated.complete.bottomLeft,
    bottomLeft: generated.complete.topRight,
    bottomRight: generated.complete.topLeft,
  };

  withSvgDebugger((debug) => renderTimingMarks(debug, expectedTimingMarks));

  const bits = decodeBottomRowTimingMarks(expectedTimingMarks);
  expect(bits).toEqual(bottomPattern);
  assert(bits);
  unsafeParse(BackMarksMetadataSchema, decodeBackTimingMarkBits(bits));
});

test('computeTimingMarkGrid minimal', () => {
  const timingMarks = findBorder({
    canvasSize: { width: 10, height: 10 },
    rects: [
      makeRect({ minX: 1, minY: 1, maxX: 2, maxY: 2 }),
      makeRect({ minX: 7, minY: 1, maxX: 8, maxY: 2 }),
      makeRect({ minX: 1, minY: 7, maxX: 2, maxY: 8 }),
      makeRect({ minX: 7, minY: 7, maxX: 8, maxY: 8 }),
    ],
  });

  assert(
    timingMarks?.topLeft &&
      timingMarks?.topRight &&
      timingMarks?.bottomLeft &&
      timingMarks?.bottomRight
  );

  expect(
    computeTimingMarkGrid(timingMarks as CompleteTimingMarks).rows
  ).toHaveLength(0);
});

test('computeTimingMarkGrid letter-size ballot card', () => {
  const generated = generateTemplateTimingMarkRects();
  const grid = withSvgDebugger((debug) =>
    computeTimingMarkGrid(generated.complete, { debug })
  );
  expect(grid.rows).toHaveLength(generated.complete.left.length - 2);
  for (const row of grid.rows) {
    expect(row).toHaveLength(generated.complete.top.length - 2);
  }
});

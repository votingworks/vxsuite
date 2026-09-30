import { expect, test } from 'vitest';
import type {
  ContestPosition,
  Election,
  GridPositionWriteIn,
  SheetPositions,
} from '@votingworks/types';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import type { ScoredPositionArea } from './bubble-ballot-ts/types.js';
import {
  isWriteInAreaFilled,
  medianWriteInAreaGridUnits,
  quadrilateralArea,
} from './write_in_area_threshold.js';

function writeInContest(
  contestId: string,
  areas: Array<[width: number, height: number]>
): ContestPosition {
  return {
    contestId,
    bounds: { row: 0, column: 0, width: 10, height: 10 },
    options: areas.map(([width, height], writeInIndex) => ({
      type: 'write-in',
      bubbleCenter: { row: writeInIndex, column: 1 },
      bounds: { row: writeInIndex, column: 0, width: 10, height: 1 },
      writeInIndex,
      writeInArea: { row: writeInIndex, column: 2, width, height },
    })),
  };
}

function electionWithWriteInAreas(
  areas: Array<[width: number, height: number]>
): Election {
  const { election } = readElectionGeneralDefinition();
  const sheet: SheetPositions = [
    [
      {
        contestId: 'not-a-write-in',
        bounds: { row: 0, column: 0, width: 10, height: 1 },
        options: [
          {
            type: 'option',
            bubbleCenter: { row: 0, column: 1 },
            bounds: { row: 0, column: 0, width: 10, height: 1 },
            optionId: 'option',
          },
        ],
      },
      writeInContest('front', areas.slice(0, 1)),
    ],
    [writeInContest('back', areas.slice(1))],
  ];
  return {
    ...election,
    ballotStyles: election.ballotStyles.map((ballotStyle, i) => ({
      ...ballotStyle,
      ballotPositions: i === 0 ? [sheet] : undefined,
    })),
  };
}

function writeInGridPosition(
  width: number,
  height: number
): GridPositionWriteIn {
  return {
    type: 'write-in',
    sheetNumber: 1,
    side: 'front',
    column: 1,
    row: 1,
    contestId: 'contest',
    writeInIndex: 0,
    writeInArea: { x: 2, y: 1, width, height },
  };
}

function scoredArea(
  score: number,
  widthPixels: number,
  heightPixels: number
): ScoredPositionArea {
  return {
    gridPosition: writeInGridPosition(1, 1),
    score,
    shape: {
      topLeft: { x: 100, y: 100 },
      topRight: { x: 100 + widthPixels, y: 100 },
      bottomLeft: { x: 100, y: 100 + heightPixels },
      bottomRight: { x: 100 + widthPixels, y: 100 + heightPixels },
    },
  };
}

test('medianWriteInAreaGridUnits is undefined without write-in positions', () => {
  expect(medianWriteInAreaGridUnits(electionWithWriteInAreas([]))).toEqual(
    undefined
  );
});

test('medianWriteInAreaGridUnits takes the middle area of an odd count', () => {
  expect(
    medianWriteInAreaGridUnits(
      electionWithWriteInAreas([
        [7.8, 1],
        [4, 0.7],
        [4.3, 4.2],
      ])
    )
  ).toBeCloseTo(7.8);
});

test('medianWriteInAreaGridUnits averages the middle areas of an even count', () => {
  expect(
    medianWriteInAreaGridUnits(
      electionWithWriteInAreas([
        [4, 1],
        [6, 1],
        [2, 1],
        [10, 1],
      ])
    )
  ).toBeCloseTo(5);
});

test('quadrilateralArea handles rectangles and parallelograms', () => {
  expect(quadrilateralArea(scoredArea(0, 400, 50).shape)).toEqual(20_000);
  expect(
    quadrilateralArea({
      topLeft: { x: 0, y: 0 },
      topRight: { x: 100, y: 0 },
      bottomRight: { x: 110, y: 50 },
      bottomLeft: { x: 10, y: 50 },
    })
  ).toBeCloseTo(5_000);
});

test('a threshold of at least 1 is an absolute number of ink pixels', () => {
  const area = scoredArea(0.05, 400, 50); // 1,000 ink pixels of 20,000
  const gridPosition = writeInGridPosition(7.8, 1);
  expect(
    isWriteInAreaFilled({
      scoredArea: area,
      gridPosition,
      threshold: 1_000,
      medianAreaGridUnits: 7.8,
    })
  ).toEqual(true);
  expect(
    isWriteInAreaFilled({
      scoredArea: area,
      gridPosition,
      threshold: 1_001,
      medianAreaGridUnits: 7.8,
    })
  ).toEqual(false);
});

test('a fractional threshold is a fraction of the median write-in area', () => {
  const medianAreaGridUnits = 7.8;
  // 2.5% of the median area is 0.195 grid units² of ink. In an area 7× smaller
  // that is 17.5% of the area; in an area the size of the median it is 2.5%.
  const small = writeInGridPosition(2, 0.5);
  const medium = writeInGridPosition(7.8, 1);
  for (const [gridPosition, score, filled] of [
    [small, 0.17, false],
    [small, 0.2, true],
    [medium, 0.024, false],
    [medium, 0.025, true],
  ] as const) {
    expect(
      isWriteInAreaFilled({
        scoredArea: scoredArea(score, 400, 50),
        gridPosition,
        threshold: 0.025,
        medianAreaGridUnits,
      })
    ).toEqual(filled);
  }
});

test('a fractional threshold without a median is a fraction of the area', () => {
  const gridPosition = writeInGridPosition(2, 0.5);
  expect(
    isWriteInAreaFilled({
      scoredArea: scoredArea(0.03, 400, 50),
      gridPosition,
      threshold: 0.025,
      medianAreaGridUnits: undefined,
    })
  ).toEqual(true);
  expect(
    isWriteInAreaFilled({
      scoredArea: scoredArea(0.02, 400, 50),
      gridPosition,
      threshold: 0.025,
      medianAreaGridUnits: undefined,
    })
  ).toEqual(false);
});

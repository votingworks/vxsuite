import { expect, test } from 'vitest';
import { SheetPositions } from './election';
import { gridPositionsFromBallotPositions } from './ballot_positions';

test('gridPositionsFromBallotPositions flattens sheets into per-bubble grid positions', () => {
  const ballotPositions: SheetPositions[] = [
    // One sheet: [front contests, back contests].
    [
      // front
      [
        {
          contestId: 'contest-1',
          bounds: { row: 11, column: 1, width: 10, height: 4 },
          options: [
            {
              type: 'option',
              bubbleCenter: { row: 12, column: 2 },
              bounds: { row: 11, column: 1, width: 10, height: 2 },
              optionId: 'candidate-1',
              partyIds: ['party-1'],
            },
            {
              type: 'write-in',
              bubbleCenter: { row: 14, column: 2 },
              bounds: { row: 13, column: 1, width: 10, height: 2 },
              writeInIndex: 0,
              writeInArea: { row: 13, column: 2.5, width: 3, height: 1 },
            },
          ],
        },
      ],
      // back
      [
        {
          contestId: 'contest-2',
          bounds: { row: 19, column: 1, width: 10, height: 2 },
          options: [
            {
              type: 'option',
              bubbleCenter: { row: 20, column: 2 },
              bounds: { row: 19, column: 1, width: 10, height: 2 },
              optionId: 'contest-2-option-yes',
            },
          ],
        },
      ],
    ],
  ];

  expect(gridPositionsFromBallotPositions(ballotPositions)).toEqual([
    {
      type: 'option',
      sheetNumber: 1,
      side: 'front',
      contestId: 'contest-1',
      column: 2,
      row: 12,
      optionId: 'candidate-1',
      partyIds: ['party-1'],
    },
    {
      type: 'write-in',
      sheetNumber: 1,
      side: 'front',
      contestId: 'contest-1',
      column: 2,
      row: 14,
      writeInIndex: 0,
      writeInArea: { x: 2.5, y: 13, width: 3, height: 1 },
    },
    {
      type: 'option',
      sheetNumber: 1,
      side: 'back',
      contestId: 'contest-2',
      column: 2,
      row: 20,
      optionId: 'contest-2-option-yes',
    },
  ]);
});

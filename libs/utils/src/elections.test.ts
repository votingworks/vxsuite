import {
  electionGeneralDefinition,
  electionGridLayoutNewHampshireAmherstFixtures,
} from '@votingworks/fixtures';
import { getElectionSheetCount } from '.';

test('getElectionSheetCount', () => {
  // election with no gridLayouts available
  expect(
    getElectionSheetCount(electionGeneralDefinition.election)
  ).toBeUndefined();

  // single page election
  expect(
    getElectionSheetCount(
      electionGridLayoutNewHampshireAmherstFixtures.election
    )
  ).toEqual(1);

  // multi-page election
  expect(
    getElectionSheetCount({
      ...electionGridLayoutNewHampshireAmherstFixtures.election,
      gridLayouts: [
        {
          ballotStyleId: 'any',
          optionBoundsFromTargetMark: {
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
          },
          gridPositions: [
            {
              type: 'option',
              sheetNumber: 1,
              side: 'front',
              column: 0,
              row: 0,
              contestId: 'any',
              optionId: 'any',
            },
            {
              type: 'option',
              sheetNumber: 2,
              side: 'front',
              column: 0,
              row: 0,
              contestId: 'any',
              optionId: 'any',
            },
            {
              type: 'option',
              sheetNumber: 2,
              side: 'back',
              column: 0,
              row: 0,
              contestId: 'any',
              optionId: 'any',
            },
          ],
        },
      ],
    })
  ).toEqual(2);
});

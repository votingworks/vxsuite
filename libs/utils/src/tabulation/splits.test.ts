import { typedAs } from '@votingworks/basics';
import { Tabulation } from '@votingworks/types';
import { populateSplits } from './splits';

interface SimpleSplit extends Tabulation.GroupSpecifier {
  count: number;
}

test('populateEmptySplits', () => {
  expect(
    populateSplits({
      expectedSplits: [
        {
          precinctId: 'precinct-1',
        },
        {
          precinctId: 'precinct-2',
        },
      ],
      nonEmptySplits: {
        'root&precinctId=precinct-1': typedAs<SimpleSplit>({
          count: 4,
        }),
      },
      groupBy: { groupByPrecinct: true },
      makeEmptySplit: () => typedAs<SimpleSplit>({ count: 0 }),
    })
  ).toEqual([
    {
      count: 4,
      precinctId: 'precinct-1',
    },
    {
      count: 0,
      precinctId: 'precinct-2',
    },
  ]);
});

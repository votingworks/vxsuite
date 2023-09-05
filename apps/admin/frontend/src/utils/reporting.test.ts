import { Tabulation } from '@votingworks/types';
import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import { err, ok } from '@votingworks/basics';
import {
  canonicalizeFilter,
  canonicalizeGroupBy,
  generateTitleForReport,
} from './reporting';

test('generateTitleForReport', () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;
  const unsupportedFilters: Tabulation.Filter[] = [
    {
      precinctIds: ['precinct-1', 'precinct-2'],
    },
    {
      ballotStyleIds: ['1M', '2F'],
    },
    {
      batchIds: ['1', '2'],
    },
    {
      scannerIds: ['1', '2'],
    },
    {
      votingMethods: ['absentee', 'precinct'],
    },
    {
      partyIds: ['0', '1'],
    },
    {
      precinctIds: ['precinct-1'],
      ballotStyleIds: ['1M'],
      batchIds: ['1'],
    },
    {
      scannerIds: ['1'],
      votingMethods: ['absentee'],
      partyIds: ['1'],
    },
    {
      batchIds: ['1'], // TODO: add support for batchIds
    },
    {
      scannerIds: ['1'], // TODO: add support for scannerIds
    },
  ];

  for (const filter of unsupportedFilters) {
    expect(generateTitleForReport({ filter, electionDefinition })).toEqual(
      err('title-not-supported')
    );
  }

  const supportedFilters: Array<[filter: Tabulation.Filter, title: string]> = [
    [
      {
        precinctIds: ['precinct-1'],
      },
      'Precinct 1 Tally Report',
    ],
    [
      {
        ballotStyleIds: ['1M'],
      },
      'Ballot Style 1M Tally Report',
    ],
    [
      {
        votingMethods: ['absentee'],
      },
      'Absentee Ballot Tally Report',
    ],
    [
      {
        precinctIds: ['precinct-1'],
        ballotStyleIds: ['1M'],
      },
      'Ballot Style 1M Precinct 1 Tally Report',
    ],
    [
      {
        precinctIds: ['precinct-1'],
        votingMethods: ['absentee'],
      },
      'Precinct 1 Absentee Ballot Tally Report',
    ],
    [
      {
        ballotStyleIds: ['1M'],
        votingMethods: ['absentee'],
      },
      'Ballot Style 1M Absentee Ballot Tally Report',
    ],
  ];

  for (const [filter, title] of supportedFilters) {
    expect(generateTitleForReport({ filter, electionDefinition })).toEqual(
      ok(title)
    );
  }
});

test('canonicalizeFilter', () => {
  expect(canonicalizeFilter({})).toEqual({});
  expect(
    canonicalizeFilter({
      precinctIds: [],
      ballotStyleIds: [],
      batchIds: [],
      scannerIds: [],
      votingMethods: [],
      partyIds: [],
    })
  ).toEqual({});
  expect(
    canonicalizeFilter({
      precinctIds: ['b', 'a'],
      ballotStyleIds: ['b', 'a'],
      batchIds: ['b', 'a'],
      scannerIds: ['b', 'a'],
      votingMethods: ['precinct', 'absentee'],
      partyIds: ['b', 'a'],
    })
  ).toEqual({
    precinctIds: ['a', 'b'],
    ballotStyleIds: ['a', 'b'],
    batchIds: ['a', 'b'],
    scannerIds: ['a', 'b'],
    votingMethods: ['absentee', 'precinct'],
    partyIds: ['a', 'b'],
  });
});

test('canonicalizeGroupBy', () => {
  expect(canonicalizeGroupBy({})).toEqual({
    groupByScanner: false,
    groupByBatch: false,
    groupByBallotStyle: false,
    groupByPrecinct: false,
    groupByParty: false,
    groupByVotingMethod: false,
  });

  const allTrueGroupBy: Tabulation.GroupBy = {
    groupByScanner: true,
    groupByBatch: true,
    groupByBallotStyle: true,
    groupByPrecinct: true,
    groupByParty: true,
    groupByVotingMethod: true,
  };
  expect(canonicalizeGroupBy(allTrueGroupBy)).toEqual(allTrueGroupBy);
});

import {
  electionFamousNames2021Fixtures,
  electionMinimalExhaustiveSampleDefinition,
} from '@votingworks/fixtures';
import { assert, typedAs } from '@votingworks/basics';
import { ElectionDefinition, PartyId, Tabulation } from '@votingworks/types';
import { filterSplits, getAllPossibleSplits, populateSplits } from './splits';
import { complexBallotStyleElectionDefinition } from '../../test/fixtures';

describe('getAllPossibleSplits - basic', () => {
  test('precinct', () => {
    const electionDefinition = electionMinimalExhaustiveSampleDefinition;
    const splits = getAllPossibleSplits(electionDefinition, {
      groupByPrecinct: true,
    });
    expect(splits).toEqual(
      typedAs<Tabulation.GroupSpecifier[]>([
        {
          precinctId: 'precinct-1',
        },
        {
          precinctId: 'precinct-2',
        },
      ])
    );
  });

  test('party', () => {
    const electionDefinition = electionMinimalExhaustiveSampleDefinition;
    const splits = getAllPossibleSplits(electionDefinition, {
      groupByParty: true,
    });
    expect(splits).toEqual(
      typedAs<Tabulation.GroupSpecifier[]>([
        {
          partyId: '0',
        },
        {
          partyId: '1',
        },
      ])
    );
  });

  test('party (when general election)', () => {
    const { electionDefinition } = electionFamousNames2021Fixtures;
    const splits = getAllPossibleSplits(electionDefinition, {
      groupByParty: true,
    });
    expect(splits).toEqual(typedAs<Tabulation.GroupSpecifier[]>([{}]));
  });

  test('ballot style', () => {
    const electionDefinition = electionMinimalExhaustiveSampleDefinition;
    const splits = getAllPossibleSplits(electionDefinition, {
      groupByBallotStyle: true,
    });
    expect(splits).toEqual(
      typedAs<Tabulation.GroupSpecifier[]>([
        {
          ballotStyleId: '1M',
        },
        {
          ballotStyleId: '2F',
        },
      ])
    );
  });

  test('voting method', () => {
    const electionDefinition = electionMinimalExhaustiveSampleDefinition;
    const splits = getAllPossibleSplits(electionDefinition, {
      groupByVotingMethod: true,
    });
    expect(splits).toEqual(
      typedAs<Tabulation.GroupSpecifier[]>([
        {
          votingMethod: 'precinct',
        },
        {
          votingMethod: 'absentee',
        },
      ])
    );
  });

  test('ballot style * party ', () => {
    const electionDefinition = electionMinimalExhaustiveSampleDefinition;
    const splits = getAllPossibleSplits(electionDefinition, {
      groupByBallotStyle: true,
      groupByParty: true,
    });
    expect(splits).toEqual(
      typedAs<Tabulation.GroupSpecifier[]>([
        {
          ballotStyleId: '1M',
          partyId: '0',
        },
        {
          ballotStyleId: '2F',
          partyId: '1',
        },
      ])
    );
  });

  test('precinct * party', () => {
    const electionDefinition = electionMinimalExhaustiveSampleDefinition;
    const splits = getAllPossibleSplits(electionDefinition, {
      groupByPrecinct: true,
      groupByParty: true,
    });
    expect(splits).toEqual(
      typedAs<Tabulation.GroupSpecifier[]>([
        {
          precinctId: 'precinct-1',
          partyId: '0',
        },
        {
          precinctId: 'precinct-1',
          partyId: '1',
        },
        {
          precinctId: 'precinct-2',
          partyId: '0',
        },
        {
          precinctId: 'precinct-2',
          partyId: '1',
        },
      ])
    );
  });

  // in order to test splits for ballot styles that are not associated with all precincts
  const modifiedMinimalExhaustiveSampleDefinition: ElectionDefinition = {
    ...electionMinimalExhaustiveSampleDefinition,
    election: {
      ...electionMinimalExhaustiveSampleDefinition.election,
      ballotStyles: [
        ...electionMinimalExhaustiveSampleDefinition.election.ballotStyles,
        {
          id: '3M',
          precincts: ['precinct-1'],
          partyId: '0' as PartyId,
          districts: [],
        },
      ],
    },
  };

  test('ballot style * precinct', () => {
    const electionDefinition = modifiedMinimalExhaustiveSampleDefinition;
    const splits = getAllPossibleSplits(electionDefinition, {
      groupByBallotStyle: true,
      groupByPrecinct: true,
    });
    expect(splits).toEqual(
      typedAs<Tabulation.GroupSpecifier[]>([
        {
          precinctId: 'precinct-1',
          ballotStyleId: '1M',
        },
        {
          precinctId: 'precinct-1',
          ballotStyleId: '2F',
        },
        {
          precinctId: 'precinct-1',
          ballotStyleId: '3M',
        },
        {
          precinctId: 'precinct-2',
          ballotStyleId: '1M',
        },
        {
          precinctId: 'precinct-2',
          ballotStyleId: '2F',
        },
      ])
    );
  });

  test('ballot style * precinct * party', () => {
    const electionDefinition = modifiedMinimalExhaustiveSampleDefinition;
    const splits = getAllPossibleSplits(electionDefinition, {
      groupByBallotStyle: true,
      groupByPrecinct: true,
      groupByParty: true,
    });
    expect(splits).toEqual(
      typedAs<Tabulation.GroupSpecifier[]>([
        {
          precinctId: 'precinct-1',
          ballotStyleId: '1M',
          partyId: '0',
        },
        {
          precinctId: 'precinct-1',
          ballotStyleId: '2F',
          partyId: '1',
        },
        {
          precinctId: 'precinct-1',
          ballotStyleId: '3M',
          partyId: '0',
        },
        {
          precinctId: 'precinct-2',
          ballotStyleId: '1M',
          partyId: '0',
        },
        {
          precinctId: 'precinct-2',
          ballotStyleId: '2F',
          partyId: '1',
        },
      ])
    );
  });

  test('batch, scanner (unsupported)', () => {
    const electionDefinition = electionMinimalExhaustiveSampleDefinition;
    expect(
      getAllPossibleSplits(electionDefinition, {
        groupByBatch: true,
      })
    ).toBeUndefined();
    expect(
      getAllPossibleSplits(electionDefinition, {
        groupByScanner: true,
      })
    ).toBeUndefined();
    expect(
      getAllPossibleSplits(electionDefinition, {
        groupByScanner: true,
        groupByVotingMethod: true,
      })
    ).toBeUndefined();
  });
});

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

describe('getAllPossibleSplits - more complex election structre', () => {
  const electionDefinition = complexBallotStyleElectionDefinition;
  const { election } = electionDefinition;

  test('precinct', () => {
    expect(
      getAllPossibleSplits(electionDefinition, {
        groupByPrecinct: true,
      })
    ).toEqual(
      election.precincts.map((precinct) => ({ precinctId: precinct.id }))
    );
  });

  test('ballot style', () => {
    expect(
      getAllPossibleSplits(electionDefinition, {
        groupByBallotStyle: true,
      })
    ).toEqual(election.ballotStyles.map((bs) => ({ ballotStyleId: bs.id })));
  });

  test('party', () => {
    expect(
      getAllPossibleSplits(electionDefinition, {
        groupByParty: true,
      })
    ).toEqual(election.parties.map((p) => ({ partyId: p.id })));

    // check double splits
  });

  test('ballot style * party', () => {
    expect(
      getAllPossibleSplits(electionDefinition, {
        groupByBallotStyle: true,
        groupByParty: true,
      })
    ).toEqual(
      election.ballotStyles.map((bs) => ({
        ballotStyleId: bs.id,
        partyId: bs.partyId,
      }))
    );
  });

  test('precinct * party', () => {
    expect(
      getAllPossibleSplits(electionDefinition, {
        groupByPrecinct: true,
        groupByParty: true,
      })
    ).toEqual(
      election.precincts.flatMap((precinct) =>
        election.parties.map((party) => ({
          partyId: party.id,
          precinctId: precinct.id,
        }))
      )
    );
  });

  test('precinct * ballot style', () => {
    expect(
      getAllPossibleSplits(electionDefinition, {
        groupByPrecinct: true,
        groupByBallotStyle: true,
      })
    ).toEqual([
      {
        ballotStyleId: 'c1-w1-mammal',
        precinctId: 'c1-w1-1',
      },
      {
        ballotStyleId: 'c1-w1-fish',
        precinctId: 'c1-w1-1',
      },
      {
        ballotStyleId: 'c1-w1-mammal',
        precinctId: 'c1-w1-2',
      },
      {
        ballotStyleId: 'c1-w1-fish',
        precinctId: 'c1-w1-2',
      },
      {
        ballotStyleId: 'c1-w2-mammal',
        precinctId: 'c1-w2-1',
      },
      {
        ballotStyleId: 'c1-w2-fish',
        precinctId: 'c1-w2-1',
      },
      {
        ballotStyleId: 'c2-w1-mammal',
        precinctId: 'c2-w1-1',
      },
      {
        ballotStyleId: 'c2-w1-fish',
        precinctId: 'c2-w1-1',
      },
      {
        ballotStyleId: 'c2-w2-mammal',
        precinctId: 'c2-w2-1',
      },
      {
        ballotStyleId: 'c2-w2-fish',
        precinctId: 'c2-w2-1',
      },
    ]);
  });
});

describe('filter splits - basic', () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;
  test('precinct filter on precinct splits', () => {
    const allSplits = getAllPossibleSplits(electionDefinition, {
      groupByPrecinct: true,
    });
    assert(allSplits);
    const filteredSplits = filterSplits(electionDefinition, allSplits, {
      precinctIds: ['precinct-1'],
    });
    expect(filteredSplits).toEqual([{ precinctId: 'precinct-1' }]);
  });

  test('ballot style filter on ballot style splits', () => {
    const allSplits = getAllPossibleSplits(electionDefinition, {
      groupByBallotStyle: true,
    });
    assert(allSplits);
    const filteredSplits = filterSplits(electionDefinition, allSplits, {
      ballotStyleIds: ['1M'],
    });
    expect(filteredSplits).toEqual([{ ballotStyleId: '1M' }]);
  });

  test('party filter on party splits', () => {
    const allSplits = getAllPossibleSplits(electionDefinition, {
      groupByParty: true,
    });
    assert(allSplits);
    const filteredSplits = filterSplits(electionDefinition, allSplits, {
      partyIds: ['0'],
    });
    expect(filteredSplits).toEqual([{ partyId: '0' }]);
  });

  test('voting method filter on voting method splits', () => {
    const allSplits = getAllPossibleSplits(electionDefinition, {
      groupByVotingMethod: true,
    });
    assert(allSplits);
    const filteredSplits = filterSplits(electionDefinition, allSplits, {
      votingMethods: ['absentee'],
    });
    expect(filteredSplits).toEqual([{ votingMethod: 'absentee' }]);
  });

  test('party filters affect ballot style splits', () => {
    const allSplits = getAllPossibleSplits(electionDefinition, {
      groupByBallotStyle: true,
    });
    assert(allSplits);
    const filteredSplits = filterSplits(electionDefinition, allSplits, {
      partyIds: ['0'],
    });
    expect(filteredSplits).toEqual([{ ballotStyleId: '1M' }]);
  });

  test('ballot style filters affect party splits', () => {
    const allSplits = getAllPossibleSplits(electionDefinition, {
      groupByParty: true,
    });
    assert(allSplits);
    const filteredSplits = filterSplits(electionDefinition, allSplits, {
      ballotStyleIds: ['1M'],
    });
    expect(filteredSplits).toEqual([{ partyId: '0' }]);
  });
});

describe('filter splits - very basic batch & scanner behavior', () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;

  expect(
    filterSplits(
      electionDefinition,
      [{ batchId: 'batch-1' }, { batchId: 'batch-2' }],
      {
        batchIds: ['batch-1'],
      }
    )
  ).toEqual([{ batchId: 'batch-1' }]);

  expect(
    filterSplits(
      electionDefinition,
      [{ scannerId: 'scanner-1' }, { scannerId: 'scanner-2' }],
      {
        scannerIds: ['scanner-1'],
      }
    )
  ).toEqual([{ scannerId: 'scanner-1' }]);
});

describe('filter splits - more complex election structure', () => {
  const electionDefinition = complexBallotStyleElectionDefinition;

  test('filters on ballot style splits', () => {
    const allSplits = getAllPossibleSplits(electionDefinition, {
      groupByBallotStyle: true,
    });
    assert(allSplits);

    // precinct filter
    const precinctFilteredSplits = filterSplits(electionDefinition, allSplits, {
      precinctIds: ['c1-w1-1', 'c1-w2-1'],
    });
    expect(precinctFilteredSplits).toEqual([
      {
        ballotStyleId: 'c1-w1-mammal',
      },
      {
        ballotStyleId: 'c1-w2-mammal',
      },
      {
        ballotStyleId: 'c1-w1-fish',
      },
      {
        ballotStyleId: 'c1-w2-fish',
      },
    ]);

    // party filter
    const partyFilteredSplits = filterSplits(electionDefinition, allSplits, {
      partyIds: ['0'],
    });
    expect(partyFilteredSplits).toEqual([
      {
        ballotStyleId: 'c1-w1-mammal',
      },
      {
        ballotStyleId: 'c1-w2-mammal',
      },
      {
        ballotStyleId: 'c2-w1-mammal',
      },
      {
        ballotStyleId: 'c2-w2-mammal',
      },
    ]);

    // party and precinct filters
    const bothFilteredSplits = filterSplits(electionDefinition, allSplits, {
      precinctIds: ['c1-w1-1', 'c1-w2-1'],
      partyIds: ['0'],
    });
    expect(bothFilteredSplits).toEqual([
      {
        ballotStyleId: 'c1-w1-mammal',
      },
      {
        ballotStyleId: 'c1-w2-mammal',
      },
    ]);
  });

  test('filters on precinct splits', () => {
    const allSplits = getAllPossibleSplits(electionDefinition, {
      groupByPrecinct: true,
    });
    assert(allSplits);

    // ballot style filter
    const ballotStyleFilteredSplits = filterSplits(
      electionDefinition,
      allSplits,
      {
        ballotStyleIds: ['c1-w1-mammal', 'c1-w2-mammal'],
      }
    );
    expect(ballotStyleFilteredSplits).toEqual([
      {
        precinctId: 'c1-w1-1',
      },
      {
        precinctId: 'c1-w1-2',
      },
      {
        precinctId: 'c1-w2-1',
      },
    ]);
  });
});

import { getEmptyElectionResults } from '@votingworks/utils';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { DEFAULT_SYSTEM_SETTINGS, Tabulation } from '@votingworks/types';
import { TallyCache, TallyCacheKey } from './tally_cache';
import { tabulateCastVoteRecords } from './full_results';
import { Store } from '../store';

const mockTabulateFilteredCastVoteRecords = jest
  .fn()
  .mockResolvedValue(
    getEmptyElectionResults(electionTwoPartyPrimaryFixtures.election)
  );

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => ({
  ...jest.requireActual('@votingworks/utils'),
  tabulateCastVoteRecords: () => mockTabulateFilteredCastVoteRecords(),
}));

test('TallyCache', () => {
  const cache = new TallyCache();
  const key: TallyCacheKey = {
    electionId: '123',
    filter: {
      precinctIds: ['precinct-1', 'precinct-2'],
      ballotStyleIds: ['ballot-style-1', 'ballot-style-2'],
    },
    groupBy: {
      groupByVotingMethod: true,
    },
  };
  const duplicateKey: TallyCacheKey = {
    electionId: '123',
    groupBy: {
      groupByVotingMethod: true,
    },
    filter: {
      ballotStyleIds: ['ballot-style-2', 'ballot-style-1'],

      precinctIds: ['precinct-2', 'precinct-1'],
    },
  };

  const mockGroupedElectionResults: Tabulation.ElectionResultsGroupMap = {
    precinct: getEmptyElectionResults(electionTwoPartyPrimaryFixtures.election),
    absentee: getEmptyElectionResults(electionTwoPartyPrimaryFixtures.election),
  };

  cache.set(key, mockGroupedElectionResults);
  expect(cache.get(key)).toEqual(mockGroupedElectionResults);
  expect(cache.get(duplicateKey)).toEqual(mockGroupedElectionResults);

  cache.clear();
  expect(cache.get(key)).toBeUndefined();
});

test('CVR tabulation employs caching', async () => {
  const tallyCache = new TallyCache();
  const store = Store.memoryStore();
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { electionData } = electionDefinition;
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
  });
  store.setCurrentElectionId(electionId);

  const filter: Tabulation.Filter = {
    precinctIds: ['precinct-1'],
  };
  const groupBy: Tabulation.GroupBy = {
    groupByVotingMethod: true,
  };

  expect(mockTabulateFilteredCastVoteRecords).toHaveBeenCalledTimes(0);
  await tabulateCastVoteRecords({
    electionId,
    store,
    filter,
    groupBy,
    tallyCache,
  });
  expect(mockTabulateFilteredCastVoteRecords).toHaveBeenCalledTimes(1);
  await tabulateCastVoteRecords({
    electionId,
    store,
    filter,
    groupBy,
    tallyCache,
  });
  expect(mockTabulateFilteredCastVoteRecords).toHaveBeenCalledTimes(1);
  tallyCache.clear();
  await tabulateCastVoteRecords({
    electionId,
    store,
    filter,
    groupBy,
    tallyCache,
  });
  expect(mockTabulateFilteredCastVoteRecords).toHaveBeenCalledTimes(2);
});

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import {
  BallotStyleGroupId,
  DEFAULT_SYSTEM_SETTINGS,
  Election,
  PollingPlace,
  safeParseElectionDefinition,
  SystemSettings,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { Buffer } from 'node:buffer';
import { Store } from './store';
import {
  generateAdminLiveResultsReportingUrls,
  getMatchingAbsenteePollingPlaces,
} from './live_results_reporting';
import {
  addMockCvrFileToStore,
  MockCastVoteRecordFile,
} from '../test/mock_cvr_file';

vi.setConfig({ testTimeout: 30_000 });

const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

beforeEach(() => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CVR_BALLOT_HASH_CHECK
  );
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

const ABSENTEE_PLACE_ALL: PollingPlace = {
  id: 'absentee-all',
  name: 'County Absentee',
  type: 'absentee',
  precincts: {
    'precinct-1': { type: 'whole' },
    'precinct-2': { type: 'whole' },
  },
};

const ABSENTEE_PLACE_PRECINCT_1: PollingPlace = {
  id: 'absentee-precinct-1',
  name: 'Precinct 1 Absentee',
  type: 'absentee',
  precincts: { 'precinct-1': { type: 'whole' } },
};

const ELECTION_DAY_PLACE: PollingPlace = {
  id: 'election-day-precinct-1',
  name: 'Precinct 1 Election Day',
  type: 'election_day',
  precincts: { 'precinct-1': { type: 'whole' } },
};

function makeElectionDefinitionWithPollingPlaces(
  pollingPlaces: PollingPlace[]
) {
  const baseDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const election: Election = {
    ...baseDefinition.election,
    pollingPlaces,
  };
  return safeParseElectionDefinition(JSON.stringify(election)).unsafeUnwrap();
}

function setupStore(
  pollingPlaces: PollingPlace[],
  systemSettings: SystemSettings = DEFAULT_SYSTEM_SETTINGS,
  cvrs: MockCastVoteRecordFile = []
) {
  const electionDefinition =
    makeElectionDefinitionWithPollingPlaces(pollingPlaces);
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionId = store.addElection({
    electionData: electionDefinition.electionData,
    systemSettingsData: JSON.stringify(systemSettings),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);
  if (cvrs.length > 0) {
    addMockCvrFileToStore({
      electionId,
      mockCastVoteRecordFile: cvrs,
      store,
    });
  }
  return { store, electionId, electionDefinition };
}

test('returns signed QR URLs when results match polling place', async () => {
  const cvrs: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
      batchId: 'batch-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'absentee',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 3,
    },
    {
      ballotStyleGroupId: '2F' as BallotStyleGroupId,
      batchId: 'batch-2',
      scannerId: 'scanner-1',
      precinctId: 'precinct-2',
      votingMethod: 'absentee',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 4,
    },
  ];
  const { store, electionId } = setupStore(
    [ABSENTEE_PLACE_ALL],
    {
      ...DEFAULT_SYSTEM_SETTINGS,
      quickResultsReportingUrl: 'https://results.example.com/submit',
    },
    cvrs
  );

  const urls = await generateAdminLiveResultsReportingUrls({
    electionId,
    store,
    pollingPlaceId: ABSENTEE_PLACE_ALL.id,
    signingMachineId: 'admin-machine-1',
    pollsTransitionTimestamp: new Date('2024-11-05T20:00:00Z').getTime(),
  });

  expect(urls.length).toBeGreaterThanOrEqual(1);
  for (const url of urls) {
    expect(url).toMatch(
      /^https:\/\/results\.example\.com\/submit\?p=[^&]+&s=[^&]+&c=[^&]+$/
    );
  }
});

test('getMatchingAbsenteePollingPlaces returns no-cvrs-loaded when no ballots', () => {
  const { store, electionId } = setupStore([
    ABSENTEE_PLACE_ALL,
    ABSENTEE_PLACE_PRECINCT_1,
    ELECTION_DAY_PLACE,
  ]);

  expect(getMatchingAbsenteePollingPlaces({ electionId, store }).err()).toEqual(
    'no-cvrs-loaded'
  );
});

test('getMatchingAbsenteePollingPlaces returns absentee places that cover all CVR precincts', () => {
  const cvrs: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
      batchId: 'batch-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'absentee',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 2,
    },
  ];
  const { store, electionId } = setupStore(
    [ABSENTEE_PLACE_ALL, ABSENTEE_PLACE_PRECINCT_1, ELECTION_DAY_PLACE],
    DEFAULT_SYSTEM_SETTINGS,
    cvrs
  );

  const matches = getMatchingAbsenteePollingPlaces({
    electionId,
    store,
  }).unsafeUnwrap();
  expect(matches.map((p) => p.id).sort()).toEqual([
    ABSENTEE_PLACE_ALL.id,
    ABSENTEE_PLACE_PRECINCT_1.id,
  ]);
});

test('getMatchingAbsenteePollingPlaces returns an empty list when no absentee place covers the CVR precincts', () => {
  const cvrs: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '2F' as BallotStyleGroupId,
      batchId: 'batch-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-2',
      votingMethod: 'absentee',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 2,
    },
  ];
  const { store, electionId } = setupStore(
    [ABSENTEE_PLACE_PRECINCT_1, ELECTION_DAY_PLACE],
    DEFAULT_SYSTEM_SETTINGS,
    cvrs
  );

  const matches = getMatchingAbsenteePollingPlaces({
    electionId,
    store,
  }).unsafeUnwrap();
  expect(matches).toEqual([]);
});

test('getMatchingAbsenteePollingPlaces excludes absentee places missing CVR precincts', () => {
  const cvrs: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
      batchId: 'batch-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'absentee',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 2,
    },
    {
      ballotStyleGroupId: '2F' as BallotStyleGroupId,
      batchId: 'batch-2',
      scannerId: 'scanner-1',
      precinctId: 'precinct-2',
      votingMethod: 'absentee',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 3,
    },
  ];
  const { store, electionId } = setupStore(
    [ABSENTEE_PLACE_ALL, ABSENTEE_PLACE_PRECINCT_1, ELECTION_DAY_PLACE],
    DEFAULT_SYSTEM_SETTINGS,
    cvrs
  );

  const matches = getMatchingAbsenteePollingPlaces({
    electionId,
    store,
  }).unsafeUnwrap();
  expect(matches.map((p) => p.id)).toEqual([ABSENTEE_PLACE_ALL.id]);
});

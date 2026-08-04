import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  electionTwoPartyPrimaryFixtures,
  makeTemporaryDirectory,
} from '@votingworks/fixtures';
import { assert, assertDefined } from '@votingworks/basics';
import { decodeQuickResultsMessage } from '@votingworks/auth';
import {
  DEFAULT_SYSTEM_SETTINGS,
  Election,
  PollingPlace,
  safeParseElectionDefinition,
  SystemSettings,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  decodeAndReadPerPrecinctCompressedTally,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { Buffer } from 'node:buffer';
import { Store } from './store.js';
import {
  generateAdminLiveResultsReportingUrls,
  getLiveReportsPollingPlaces,
} from './live_results_reporting.js';
import {
  addMockCvrFileToStore,
  MockCastVoteRecordFile,
} from '../test/mock_cvr_file.js';

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

async function setupStore(
  pollingPlaces: PollingPlace[],
  systemSettings: SystemSettings = DEFAULT_SYSTEM_SETTINGS,
  cvrs: MockCastVoteRecordFile = []
) {
  const electionDefinition =
    makeElectionDefinitionWithPollingPlaces(pollingPlaces);
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionId = await store.addElection({
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
      pollingPlaceId: ABSENTEE_PLACE_ALL.id,
    });
  }
  return { store, electionId, electionDefinition };
}

test('returns signed QR URLs for the polling place associated with the CVRs', async () => {
  const cvrs: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-1',
      scannerId: 'scanner-1',
      scannerMachineType: 'central',
      pollingPlaceId: ABSENTEE_PLACE_ALL.id,
      precinctId: 'precinct-1',
      votingMethod: 'absentee',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 3,
    },
    {
      ballotStyleGroupId: '2F',
      batchId: 'batch-2',
      scannerId: 'scanner-1',
      scannerMachineType: 'central',
      pollingPlaceId: ABSENTEE_PLACE_ALL.id,
      precinctId: 'precinct-2',
      votingMethod: 'absentee',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 4,
    },
  ];
  const { store, electionId } = await setupStore(
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

test('getLiveReportsPollingPlaces returns no-cvrs-loaded when no ballots', async () => {
  const { store, electionId } = await setupStore([
    ABSENTEE_PLACE_ALL,
    ABSENTEE_PLACE_PRECINCT_1,
    ELECTION_DAY_PLACE,
  ]);

  expect(getLiveReportsPollingPlaces({ electionId, store }).err()).toEqual(
    'no-cvrs-loaded'
  );
});

test('getLiveReportsPollingPlaces returns no-cvrs-loaded when only precinct scanner CVRs are loaded', async () => {
  const cvrs: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-1',
      scannerId: 'scanner-1',
      scannerMachineType: 'precinct',
      pollingPlaceId: ELECTION_DAY_PLACE.id,
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 2,
    },
  ];
  const { store, electionId } = await setupStore(
    [ABSENTEE_PLACE_ALL, ABSENTEE_PLACE_PRECINCT_1, ELECTION_DAY_PLACE],
    DEFAULT_SYSTEM_SETTINGS,
    cvrs
  );

  expect(getLiveReportsPollingPlaces({ electionId, store }).err()).toEqual(
    'no-cvrs-loaded'
  );
});

test('getLiveReportsPollingPlaces returns the polling places, of any type, associated with central scanner CVRs', async () => {
  const cvrs: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-1',
      scannerId: 'central-scanner-1',
      scannerMachineType: 'central',
      pollingPlaceId: ABSENTEE_PLACE_PRECINCT_1.id,
      precinctId: 'precinct-1',
      votingMethod: 'absentee',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 2,
    },
    // A central scanner batch associated with a non-absentee polling place
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-2',
      scannerId: 'central-scanner-2',
      scannerMachineType: 'central',
      pollingPlaceId: ELECTION_DAY_PLACE.id,
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 3,
    },
    // Precinct scanner batches never contribute polling places
    {
      ballotStyleGroupId: '2F',
      batchId: 'batch-3',
      scannerId: 'precinct-scanner-1',
      scannerMachineType: 'precinct',
      pollingPlaceId: ABSENTEE_PLACE_ALL.id,
      precinctId: 'precinct-2',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 4,
    },
  ];
  const { store, electionId } = await setupStore(
    [ELECTION_DAY_PLACE, ABSENTEE_PLACE_ALL, ABSENTEE_PLACE_PRECINCT_1],
    DEFAULT_SYSTEM_SETTINGS,
    cvrs
  );

  const places = getLiveReportsPollingPlaces({
    electionId,
    store,
  }).unsafeUnwrap();
  // In election definition order
  expect(places.map((p) => p.id)).toEqual([
    ELECTION_DAY_PLACE.id,
    ABSENTEE_PLACE_PRECINCT_1.id,
  ]);
});

test('getLiveReportsPollingPlaces ignores central scanner batches with no CVRs', async () => {
  const cvrs: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-1',
      scannerId: 'central-scanner-1',
      scannerMachineType: 'central',
      pollingPlaceId: ABSENTEE_PLACE_PRECINCT_1.id,
      precinctId: 'precinct-1',
      votingMethod: 'absentee',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 2,
    },
    // A batch record with no CVRs
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-2',
      scannerId: 'central-scanner-2',
      scannerMachineType: 'central',
      pollingPlaceId: ELECTION_DAY_PLACE.id,
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 0,
    },
  ];
  const { store, electionId } = await setupStore(
    [ABSENTEE_PLACE_ALL, ABSENTEE_PLACE_PRECINCT_1, ELECTION_DAY_PLACE],
    DEFAULT_SYSTEM_SETTINGS,
    cvrs
  );

  const places = getLiveReportsPollingPlaces({
    electionId,
    store,
  }).unsafeUnwrap();
  expect(places.map((p) => p.id)).toEqual([ABSENTEE_PLACE_PRECINCT_1.id]);
});

test('generateAdminLiveResultsReportingUrls throws for a polling place with no central scanner batches', async () => {
  const cvrs: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-1',
      scannerId: 'central-scanner-1',
      scannerMachineType: 'central',
      pollingPlaceId: ABSENTEE_PLACE_PRECINCT_1.id,
      precinctId: 'precinct-1',
      votingMethod: 'absentee',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 2,
    },
  ];
  const { store, electionId } = await setupStore(
    [ABSENTEE_PLACE_ALL, ABSENTEE_PLACE_PRECINCT_1],
    {
      ...DEFAULT_SYSTEM_SETTINGS,
      quickResultsReportingUrl: 'https://results.example.com/submit',
    },
    cvrs
  );

  await expect(
    generateAdminLiveResultsReportingUrls({
      electionId,
      store,
      pollingPlaceId: ABSENTEE_PLACE_ALL.id,
      signingMachineId: 'admin-machine-1',
      pollsTransitionTimestamp: new Date('2024-11-05T20:00:00Z').getTime(),
    })
  ).rejects.toThrow(
    `No central scanner batches found for polling place ${ABSENTEE_PLACE_ALL.id}`
  );
});

test('reported tally includes only the results of central scanner batches associated with the polling place', async () => {
  const cvrs: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-1',
      scannerId: 'central-scanner-1',
      scannerMachineType: 'central',
      pollingPlaceId: ABSENTEE_PLACE_PRECINCT_1.id,
      precinctId: 'precinct-1',
      votingMethod: 'absentee',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 3,
    },
    // Precinct scanner ballots in the same precinct. These must not leak into
    // the reported tally.
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-2',
      scannerId: 'precinct-scanner-1',
      scannerMachineType: 'precinct',
      pollingPlaceId: ELECTION_DAY_PLACE.id,
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['allow-fishing'] },
      card: { type: 'bmd' },
      multiplier: 4,
    },
    // Central scanner ballots for a different polling place, also in the same
    // precinct. These must not leak into the reported tally either.
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-3',
      scannerId: 'central-scanner-2',
      scannerMachineType: 'central',
      pollingPlaceId: ABSENTEE_PLACE_ALL.id,
      precinctId: 'precinct-1',
      votingMethod: 'absentee',
      votes: { fishing: ['regulate-fishing'] },
      card: { type: 'bmd' },
      multiplier: 5,
    },
  ];
  const { store, electionId, electionDefinition } = await setupStore(
    [ABSENTEE_PLACE_ALL, ABSENTEE_PLACE_PRECINCT_1, ELECTION_DAY_PLACE],
    {
      ...DEFAULT_SYSTEM_SETTINGS,
      quickResultsReportingUrl: 'https://results.example.com/submit',
    },
    cvrs
  );

  const urls = await generateAdminLiveResultsReportingUrls({
    electionId,
    store,
    pollingPlaceId: ABSENTEE_PLACE_PRECINCT_1.id,
    signingMachineId: 'admin-machine-1',
    pollsTransitionTimestamp: new Date('2024-11-05T20:00:00Z').getTime(),
  });
  expect(urls).toHaveLength(1);

  // Decode the URL payload the same way the live reports receiver does
  const payload = assertDefined(
    new URL(assertDefined(urls[0])).searchParams.get('p')
  );
  const decoded = decodeQuickResultsMessage(payload);
  expect(decoded.numPages).toEqual(1);
  expect(decoded.ballotCount).toEqual(3);

  const contestResultsByPrecinct = decodeAndReadPerPrecinctCompressedTally({
    election: electionDefinition.election,
    encodedTally: decoded.encodedCompressedTally,
  });
  const fishingResults = assertDefined(contestResultsByPrecinct['precinct-1'])[
    'fishing'
  ];
  assert(
    fishingResults !== undefined && fishingResults.contestType === 'yesno'
  );
  expect(fishingResults.ballots).toEqual(3);
  expect(fishingResults.tallies['ban-fishing']).toEqual(3);
  expect(fishingResults.tallies['allow-fishing']).toEqual(0);
  expect(fishingResults.tallies['regulate-fishing']).toEqual(0);
});

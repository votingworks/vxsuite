import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import {
  BallotStyleGroupId,
  DEFAULT_SYSTEM_SETTINGS,
  Election,
  PollingPlace,
  safeParseElectionDefinition,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';
import { addMockCvrFileToStore } from '../test/mock_cvr_file';

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

const COUNTY_ABSENTEE: PollingPlace = {
  id: 'absentee-county',
  name: 'County Absentee',
  type: 'absentee',
  precincts: {
    'precinct-1': { type: 'whole' },
    'precinct-2': { type: 'whole' },
  },
};

function makeDefinition(pollingPlaces: PollingPlace[]) {
  const baseDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const election: Election = {
    ...baseDefinition.election,
    pollingPlaces,
  };
  return safeParseElectionDefinition(JSON.stringify(election)).unsafeUnwrap();
}

test('getMatchingAbsenteePollingPlaces and getLiveResultsReportingUrl', async () => {
  const electionDefinition = makeDefinition([COUNTY_ABSENTEE]);
  const { apiClient, auth, workspace } = buildTestEnvironment();
  const electionId = await configureMachine(
    apiClient,
    auth,
    electionDefinition,
    undefined,
    {
      ...DEFAULT_SYSTEM_SETTINGS,
      quickResultsReportingUrl: 'https://results.example.com/submit',
    }
  );
  mockElectionManagerAuth(auth, electionDefinition.election);

  // No CVRs loaded yet.
  expect((await apiClient.getMatchingAbsenteePollingPlaces()).err()).toEqual(
    'no-cvrs-loaded'
  );

  // Load some mock CVRs covering the absentee polling place's precincts.
  addMockCvrFileToStore({
    electionId,
    store: workspace.store,
    mockCastVoteRecordFile: [
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
    ],
  });

  const matching = (
    await apiClient.getMatchingAbsenteePollingPlaces()
  ).unsafeUnwrap();
  expect(matching.map((p) => p.id)).toEqual([COUNTY_ABSENTEE.id]);

  const urls = await apiClient.getLiveResultsReportingUrl({
    pollingPlaceId: COUNTY_ABSENTEE.id,
  });
  expect(urls.length).toBeGreaterThanOrEqual(1);
  for (const url of urls) {
    expect(url).toMatch(
      /^https:\/\/results\.example\.com\/submit\?p=[^&]+&s=[^&]+&c=[^&]+$/
    );
  }
});

import { assertDefined } from '@votingworks/basics';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  constructElectionKey,
  DEFAULT_SYSTEM_SETTINGS,
  EncodedBallotEntry,
  TEST_JURISDICTION,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { beforeAll, beforeEach, expect, vi } from 'vitest';
import { apptest, buildBallotsForElection } from '../test/app';

const jurisdiction = TEST_JURISDICTION;
const machineType = 'print';
const electionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();
let ballots: EncodedBallotEntry[];
const electionKey = constructElectionKey(electionDefinition.election);

const mockFeatureFlagger = getFeatureFlagMock();

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

// Build shared fixtures once before all tests
beforeAll(async () => {
  ballots = await buildBallotsForElection({
    electionDefinition,
    ballotModes: ['official'],
  });
});

beforeEach(() => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
  setPollingPlacesEnabled(false);
});

apptest(
  'getAuthStatus',
  async ({ apiClient, auth, configureMachine, workspace }) => {
    await configureMachine({
      electionDefinition,
      ballots,
    });

    workspace.store.setPrecinctSelection(
      singlePrecinctSelectionFor(electionDefinition.election.precincts[0].id)
    );

    await apiClient.getAuthStatus();
    expect(auth.getAuthStatus).toHaveBeenLastCalledWith({
      ...DEFAULT_SYSTEM_SETTINGS.auth,
      electionKey,
      jurisdiction,
      machineType,
      isConfigured: true,
    });
  }
);

apptest(
  'getAuthStatus - configured state is based on polling place selection',
  async ({ apiClient, auth, configureMachine }) => {
    setPollingPlacesEnabled(true);

    await configureMachine({
      electionDefinition,
      ballots,
    });

    await apiClient.getAuthStatus();
    expect(auth.getAuthStatus).toHaveBeenLastCalledWith({
      ...DEFAULT_SYSTEM_SETTINGS.auth,
      electionKey,
      jurisdiction,
      machineType,
      isConfigured: false,
    });

    const { election } = electionDefinition;
    const [pollingPlace] = assertDefined(election.pollingPlaces);
    await apiClient.setPollingPlaceId({ id: pollingPlace.id });

    await apiClient.getAuthStatus();
    expect(auth.getAuthStatus).toHaveBeenLastCalledWith({
      ...DEFAULT_SYSTEM_SETTINGS.auth,
      electionKey,
      jurisdiction,
      machineType,
      isConfigured: true,
    });
  }
);

apptest(
  'checkPin',
  async ({ apiClient, auth, configureMachine, workspace }) => {
    await configureMachine({
      electionDefinition,
      ballots,
    });

    workspace.store.setPrecinctSelection(
      singlePrecinctSelectionFor(electionDefinition.election.precincts[0].id)
    );
    await apiClient.checkPin({ pin: '123456' });
    expect(auth.checkPin).toHaveBeenCalledTimes(1);
    expect(auth.checkPin).toHaveBeenNthCalledWith(
      1,
      {
        ...DEFAULT_SYSTEM_SETTINGS.auth,
        electionKey,
        jurisdiction,
        machineType,
        isConfigured: true,
      },
      { pin: '123456' }
    );
  }
);

apptest('logOut', async ({ apiClient, auth, configureMachine, workspace }) => {
  await configureMachine({
    electionDefinition,
    ballots,
  });

  workspace.store.setPrecinctSelection(
    singlePrecinctSelectionFor(electionDefinition.election.precincts[0].id)
  );
  await apiClient.logOut();
  expect(auth.logOut).toHaveBeenCalledTimes(1);
  expect(auth.logOut).toHaveBeenNthCalledWith(1, {
    ...DEFAULT_SYSTEM_SETTINGS.auth,
    electionKey,
    jurisdiction,
    machineType,
    isConfigured: true,
  });
});

apptest(
  'updateSessionExpiry',
  async ({ apiClient, auth, configureMachine, workspace }) => {
    await configureMachine({
      electionDefinition,
      ballots,
    });

    workspace.store.setPrecinctSelection(
      singlePrecinctSelectionFor(electionDefinition.election.precincts[0].id)
    );
    await apiClient.updateSessionExpiry({
      sessionExpiresAt: new Date(Date.now() + 60_000),
    });
    expect(auth.updateSessionExpiry).toHaveBeenCalledTimes(1);
    expect(auth.updateSessionExpiry).toHaveBeenNthCalledWith(
      1,
      {
        ...DEFAULT_SYSTEM_SETTINGS.auth,
        electionKey,
        jurisdiction,
        machineType,
        isConfigured: true,
      },
      { sessionExpiresAt: expect.any(Date) }
    );
  }
);

function setPollingPlacesEnabled(enabled: boolean) {
  const { ENABLE_POLLING_PLACES } = BooleanEnvironmentVariableName;
  if (enabled) {
    mockFeatureFlagger.enableFeatureFlag(ENABLE_POLLING_PLACES);
  } else {
    mockFeatureFlagger.disableFeatureFlag(ENABLE_POLLING_PLACES);
  }
}

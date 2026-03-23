import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { Server } from 'node:http';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  constructElectionKey,
  DEFAULT_SYSTEM_SETTINGS,
  EncodedBallotEntry,
  TEST_JURISDICTION,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import {
  buildTestEnvironment,
  configureMachine,
  buildBallotsForElection,
} from '../test/app.js';

const jurisdiction = TEST_JURISDICTION;
const machineType = 'print';
const electionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();
let ballots: EncodedBallotEntry[];
const electionKey = constructElectionKey(electionDefinition.election);

// Build shared fixtures once before all tests
beforeAll(async () => {
  ballots = await buildBallotsForElection({
    electionDefinition,
    ballotModes: ['official'],
  });
});

beforeEach(() => {
  vi.stubEnv(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION,
    'TRUE'
  );
});

let server: Server | undefined;

afterEach(() => {
  vi.unstubAllEnvs();
  server?.close();
  server = undefined;
});

test('getAuthStatus', async () => {
  const env = buildTestEnvironment();
  server = env.server;
  const { apiClient, auth, mockUsbDrive, workspace } = env;

  await configureMachine({
    electionDefinition,
    ballots,
    apiClient,
    auth,
    mockUsbDrive,
  });

  workspace.store.setPrecinctSelection(
    singlePrecinctSelectionFor(electionDefinition.election.precincts[0]!.id)
  );

  vi.mocked(auth.getAuthStatus).mockClear(); // Clear mock calls from configureMachine

  await apiClient.getAuthStatus();
  expect(auth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(auth.getAuthStatus).toHaveBeenNthCalledWith(1, {
    ...DEFAULT_SYSTEM_SETTINGS.auth,
    electionKey,
    jurisdiction,
    machineType,
    isConfigured: true,
  });
});

test('checkPin', async () => {
  const env = buildTestEnvironment();
  server = env.server;
  const { apiClient, auth, mockUsbDrive, workspace } = env;

  await configureMachine({
    electionDefinition,
    ballots,
    apiClient,
    auth,
    mockUsbDrive,
  });

  workspace.store.setPrecinctSelection(
    singlePrecinctSelectionFor(electionDefinition.election.precincts[0]!.id)
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
});

test('logOut', async () => {
  const env = buildTestEnvironment();
  server = env.server;
  const { apiClient, auth, mockUsbDrive, workspace } = env;

  await configureMachine({
    electionDefinition,
    ballots,
    apiClient,
    auth,
    mockUsbDrive,
  });

  workspace.store.setPrecinctSelection(
    singlePrecinctSelectionFor(electionDefinition.election.precincts[0]!.id)
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

test('updateSessionExpiry', async () => {
  const env = buildTestEnvironment();
  server = env.server;
  const { apiClient, auth, mockUsbDrive, workspace } = env;

  await configureMachine({
    electionDefinition,
    ballots,
    apiClient,
    auth,
    mockUsbDrive,
  });

  workspace.store.setPrecinctSelection(
    singlePrecinctSelectionFor(electionDefinition.election.precincts[0]!.id)
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
});

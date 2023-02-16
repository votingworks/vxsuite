import { err, ok, Result } from '@votingworks/basics';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  fakeElectionManagerUser,
  fakePollWorkerUser,
  mockOf,
} from '@votingworks/test-utils';
import { ElectionDefinition, Optional } from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  ReportSourceMachineType,
  ScannerReportData,
  ScannerReportDataSchema,
} from '@votingworks/utils';

import { createApp } from '../test/app_helpers';

test('uses machine config from env', async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    VX_MACHINE_ID: 'test-machine-id',
    VX_CODE_VERSION: 'test-code-version',
    VX_SCREEN_ORIENTATION: 'landscape',
  };

  const { apiClient } = createApp();
  expect(await apiClient.getMachineConfig()).toEqual({
    machineId: 'test-machine-id',
    codeVersion: 'test-code-version',
    screenOrientation: 'landscape',
  });

  process.env = originalEnv;
});

test('uses default machine config if not set', async () => {
  const { apiClient } = createApp();
  expect(await apiClient.getMachineConfig()).toEqual({
    machineId: '0000',
    codeVersion: 'dev',
    screenOrientation: 'portrait',
  });
});

test('auth', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { electionHash } = electionDefinition;
  const { apiClient, mockAuth } = createApp();

  await apiClient.getAuthStatus({ electionHash });
  await apiClient.checkPin({ electionHash, pin: '123456' });
  await apiClient.startCardlessVoterSession({
    electionHash,
    ballotStyleId: 'b1',
    precinctId: 'p1',
  });
  await apiClient.endCardlessVoterSession({ electionHash });

  expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(mockAuth.getAuthStatus).toHaveBeenNthCalledWith(1, {
    electionHash,
  });
  expect(mockAuth.checkPin).toHaveBeenCalledTimes(1);
  expect(mockAuth.checkPin).toHaveBeenNthCalledWith(
    1,
    { electionHash },
    { pin: '123456' }
  );
  expect(mockAuth.startCardlessVoterSession).toHaveBeenCalledTimes(1);
  expect(mockAuth.startCardlessVoterSession).toHaveBeenNthCalledWith(
    1,
    { electionHash },
    { ballotStyleId: 'b1', precinctId: 'p1' }
  );
  expect(mockAuth.endCardlessVoterSession).toHaveBeenCalledTimes(1);
  expect(mockAuth.endCardlessVoterSession).toHaveBeenNthCalledWith(1, {
    electionHash,
  });
});

test('read election definition from card', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { electionData, electionHash } = electionDefinition;
  const { apiClient, mockAuth } = createApp();

  mockOf(mockAuth.readCardDataAsString).mockImplementation(() =>
    Promise.resolve(ok(electionData))
  );

  let result: Result<ElectionDefinition, Error>;

  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({ status: 'logged_out', reason: 'no_card' })
  );
  result = await apiClient.readElectionDefinitionFromCard({ electionHash });
  expect(result).toEqual(err(new Error('User is not logged in')));

  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakePollWorkerUser(electionDefinition),
    })
  );
  result = await apiClient.readElectionDefinitionFromCard({ electionHash });
  expect(result).toEqual(err(new Error('User is not an election manager')));

  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakeElectionManagerUser(electionDefinition),
    })
  );
  result = await apiClient.readElectionDefinitionFromCard({ electionHash });
  expect(result).toEqual(ok(electionDefinition));
  expect(mockAuth.readCardDataAsString).toHaveBeenCalledTimes(1);
  expect(mockAuth.readCardDataAsString).toHaveBeenNthCalledWith(1, {
    electionHash,
  });

  mockOf(mockAuth.readCardDataAsString).mockImplementation(() =>
    Promise.resolve(ok(undefined))
  );
  result = await apiClient.readElectionDefinitionFromCard({ electionHash });
  expect(result).toEqual(
    err(new Error('Unable to read election definition from card'))
  );
  expect(mockAuth.readCardDataAsString).toHaveBeenCalledTimes(2);
  expect(mockAuth.readCardDataAsString).toHaveBeenNthCalledWith(2, {
    electionHash,
  });
});

test('read scanner report data from card', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { electionHash } = electionDefinition;
  const { apiClient, mockAuth } = createApp();

  const scannerReportData: ScannerReportData = {
    ballotCounts: {},
    isLiveMode: false,
    machineId: '0000',
    pollsTransition: 'close_polls',
    precinctSelection: ALL_PRECINCTS_SELECTION,
    tally: [],
    tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
    timePollsTransitioned: 0,
    timeSaved: 0,
    totalBallotsScanned: 0,
  };
  mockOf(mockAuth.readCardData).mockImplementation(() =>
    Promise.resolve(ok(scannerReportData))
  );

  let result: Result<Optional<ScannerReportData>, Error>;

  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({ status: 'logged_out', reason: 'no_card' })
  );
  result = await apiClient.readScannerReportDataFromCard({ electionHash });
  expect(result).toEqual(err(new Error('User is not logged in')));

  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakeElectionManagerUser(electionDefinition),
    })
  );
  result = await apiClient.readScannerReportDataFromCard({ electionHash });
  expect(result).toEqual(err(new Error('User is not a poll worker')));

  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakePollWorkerUser(electionDefinition),
    })
  );
  result = await apiClient.readScannerReportDataFromCard({ electionHash });
  expect(result).toEqual(ok(scannerReportData));
  expect(mockAuth.readCardData).toHaveBeenCalledTimes(1);
  expect(mockAuth.readCardData).toHaveBeenNthCalledWith(
    1,
    { electionHash },
    { schema: ScannerReportDataSchema }
  );
});

test('clear scanner report data from card', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { electionHash } = electionDefinition;
  const { apiClient, mockAuth } = createApp();

  mockOf(mockAuth.clearCardData).mockImplementation(() =>
    Promise.resolve(ok())
  );

  let result: Result<void, Error>;

  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({ status: 'logged_out', reason: 'no_card' })
  );
  result = await apiClient.clearScannerReportDataFromCard({ electionHash });
  expect(result).toEqual(err(new Error('User is not logged in')));

  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakeElectionManagerUser(electionDefinition),
    })
  );
  result = await apiClient.clearScannerReportDataFromCard({ electionHash });
  expect(result).toEqual(err(new Error('User is not a poll worker')));

  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakePollWorkerUser(electionDefinition),
    })
  );
  result = await apiClient.clearScannerReportDataFromCard({ electionHash });
  expect(result).toEqual(ok());
  expect(mockAuth.clearCardData).toHaveBeenCalledTimes(1);
  expect(mockAuth.clearCardData).toHaveBeenNthCalledWith(1, {
    electionHash,
  });
});

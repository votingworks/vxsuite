import {
  electionGridLayoutNewHampshireAmherstFixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { tmpNameSync } from 'tmp';
import { readFileSync } from 'fs';
import { LogEventId } from '@votingworks/logging';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';

jest.setTimeout(60_000);

// mock SKIP_CVR_ELECTION_HASH_CHECK to allow us to use old cvr fixtures
const featureFlagMock = getFeatureFlagMock();
jest.mock('@votingworks/utils', () => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
      featureFlagMock.isEnabled(flag),
  };
});

beforeEach(() => {
  jest.restoreAllMocks();
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CVR_ELECTION_HASH_CHECK
  );
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CAST_VOTE_RECORDS_AUTHENTICATION
  );
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

test('batch export', async () => {
  const { electionDefinition, castVoteRecordReport } =
    electionGridLayoutNewHampshireAmherstFixtures;

  const { apiClient, auth, logger } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordReport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  const path = tmpNameSync();
  const exportResult = await apiClient.exportBatchResults({ path });
  expect(exportResult.isOk()).toEqual(true);
  expect(readFileSync(path, 'utf-8').toString()).toMatchSnapshot();
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    {
      disposition: 'success',
      filename: path,
      message: `Saved batch results to ${path} on the USB drive.`,
    }
  );

  // mock a failure
  const offLimitsPath = '/root/hidden';
  const failedExportResult = await apiClient.exportBatchResults({
    path: offLimitsPath,
  });
  expect(failedExportResult.isErr()).toEqual(true);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    {
      disposition: 'failure',
      filename: offLimitsPath,
      message: `Failed to save batch results to ${offLimitsPath} on the USB drive.`,
    }
  );
});

test('sems export', async () => {
  const { electionDefinition, castVoteRecordReport } =
    electionTwoPartyPrimaryFixtures;

  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordReport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  const semsExportableTallies = await apiClient.getSemsExportableTallies();
  const { talliesByPrecinct } = semsExportableTallies;
  expect(Object.keys(talliesByPrecinct)).toHaveLength(2);
  expect(talliesByPrecinct['precinct-1']).toMatchSnapshot();
  expect(talliesByPrecinct['precinct-2']).toEqual(
    talliesByPrecinct['precinct-1']
  );
});

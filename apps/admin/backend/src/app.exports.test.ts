import {
  electionGridLayoutNewHampshireAmherstFixtures,
  electionMinimalExhaustiveSampleFixtures,
} from '@votingworks/fixtures';
import {
  BooleanEnvironmentVariableName,
  buildManualResultsFixture,
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
    electionMinimalExhaustiveSampleFixtures;

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

test('precinct / voting method results export', async () => {
  const { electionDefinition, castVoteRecordReport } =
    electionMinimalExhaustiveSampleFixtures;

  const { apiClient, auth, logger } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordReport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  const path = tmpNameSync();
  const exportResult = await apiClient.exportResultsCsv({ path });
  expect(exportResult.isOk()).toEqual(true);
  expect(readFileSync(path, 'utf-8').toString()).toMatchSnapshot();
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    {
      disposition: 'success',
      filename: path,
      message: `Saved csv results to ${path} on the USB drive.`,
    }
  );

  // mock a failure
  const offLimitsPath = '/root/hidden';
  const failedExportResult = await apiClient.exportResultsCsv({
    path: offLimitsPath,
  });
  expect(failedExportResult.isErr()).toEqual(true);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    {
      disposition: 'failure',
      filename: offLimitsPath,
      message: `Failed to save csv results to ${offLimitsPath} on the USB drive.`,
    }
  );
});

test('precinct / voting method results export - wia and manual data', async () => {
  const { electionDefinition, castVoteRecordReport } =
    electionGridLayoutNewHampshireAmherstFixtures;
  const { election } = electionDefinition;

  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordReport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  const candidateContestId =
    'State-Representatives-Hillsborough-District-34-b1012d38';

  // export without wia and manual data
  const path = tmpNameSync();
  const exportResult = await apiClient.exportResultsCsv({ path });
  expect(exportResult.isOk()).toEqual(true);
  const fileContentForCandidateContest = readFileSync(path, 'utf-8')
    .toString()
    .split('\n')
    .filter((line) => line.includes(candidateContestId))
    .join('\n');
  expect(fileContentForCandidateContest).toMatchSnapshot();

  // add manual data
  await apiClient.setManualResults({
    precinctId: election.precincts[0]!.id,
    votingMethod: 'absentee',
    ballotStyleId: election.ballotStyles[0]!.id,
    manualResults: buildManualResultsFixture({
      election,
      ballotCount: 10,
      contestResultsSummaries: {
        [candidateContestId]: {
          type: 'candidate',
          ballots: 10,
          overvotes: 0,
          undervotes: 0,
          officialOptionTallies: {
            'Obadiah-Carrigan-5c95145a': 10,
          },
        },
      },
    }),
  });

  // adjudicate write-ins
  const writeIns = await apiClient.getWriteIns({
    contestId: candidateContestId,
  });
  for (const writeIn of writeIns) {
    await apiClient.adjudicateWriteIn({
      writeInId: writeIn.id,
      type: 'invalid',
    });
  }

  // export with wia and manual data
  const path2 = tmpNameSync();
  const exportResult2 = await apiClient.exportResultsCsv({ path: path2 });
  expect(exportResult2.isOk()).toEqual(true);
  const fileContentForCandidateContest2 = readFileSync(path2, 'utf-8')
    .toString()
    .split('\n')
    .filter((line) => line.includes(candidateContestId))
    .join('\n');
  expect(fileContentForCandidateContest2).toMatchSnapshot();
});

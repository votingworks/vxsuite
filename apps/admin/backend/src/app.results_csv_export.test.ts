import {
  electionGridLayoutNewHampshireAmherstFixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import {
  BooleanEnvironmentVariableName,
  buildManualResultsFixture,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { tmpNameSync } from 'tmp';
import { readFileSync } from 'fs';
import { LogEventId } from '@votingworks/logging';
import { Tabulation } from '@votingworks/types';
import { Client } from '@votingworks/grout';
import { parseCsv } from '../test/csv';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';
import { Api } from './app';

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

async function getParsedExport({
  apiClient,
  groupBy,
  filter,
}: {
  apiClient: Client<Api>;
  groupBy?: Tabulation.GroupBy;
  filter?: Tabulation.Filter;
}): Promise<ReturnType<typeof parseCsv>> {
  const path = tmpNameSync();
  const exportResult = await apiClient.exportResultsCsv({
    path,
    groupBy,
    filter,
  });
  expect(exportResult.isOk()).toEqual(true);
  return parseCsv(readFileSync(path, 'utf-8').toString());
}

it('exports expected results for full election', async () => {
  const { electionDefinition, castVoteRecordExport } =
    electionTwoPartyPrimaryFixtures;

  const { apiClient, auth, logger } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordExport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  const path = tmpNameSync();
  const exportResult = await apiClient.exportResultsCsv({ path });
  expect(exportResult.isOk()).toEqual(true);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    {
      disposition: 'success',
      filename: path,
      message: `Saved csv results to ${path} on the USB drive.`,
    }
  );

  const fileContent = readFileSync(path, 'utf-8').toString();
  const { headers, rows } = parseCsv(fileContent);
  expect(headers).toEqual([
    'Contest',
    'Contest ID',
    'Selection',
    'Selection ID',
    'Votes',
  ]);

  const bestAnimalMammalExpectedValues: Record<string, string> = {
    horse: '4',
    otter: '4',
    fox: '36',
    overvotes: '8',
    undervotes: '4',
  };
  const bestAnimalMammalRows = rows.filter(
    (row) => row['Contest ID'] === 'best-animal-mammal'
  );
  expect(bestAnimalMammalRows).toHaveLength(5);
  for (const [selectionId, votes] of Object.entries(
    bestAnimalMammalExpectedValues
  )) {
    expect(votes).toEqual(bestAnimalMammalExpectedValues[selectionId]);
  }

  const fishingExpectedValues: Record<string, string> = {
    'ban-fishing': '8',
    'allow-fishing': '8',
    overvotes: '8',
    undervotes: '88',
  };
  const fishingRows = rows.filter((row) => row['Contest ID'] === 'fishing');
  expect(fishingRows).toHaveLength(4);
  for (const [selectionId, votes] of Object.entries(fishingExpectedValues)) {
    expect(votes).toEqual(fishingExpectedValues[selectionId]);
  }
});

it('logs failure if export fails for some reason', async () => {
  const { electionDefinition, castVoteRecordExport } =
    electionTwoPartyPrimaryFixtures;

  const { apiClient, auth, logger } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordExport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

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

it('incorporates wia and manual data', async () => {
  const { electionDefinition, castVoteRecordExport } =
    electionGridLayoutNewHampshireAmherstFixtures;
  const { election } = electionDefinition;

  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordExport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  const groupBy: Tabulation.GroupBy = {
    groupByVotingMethod: true,
  };
  const candidateContestId =
    'State-Representatives-Hillsborough-District-34-b1012d38';
  const officialCandidateId = 'Obadiah-Carrigan-5c95145a';

  function rowExists(
    rows: ReturnType<typeof parseCsv>['rows'],
    selectionId: string,
    votingMethod: string,
    votes: number
  ): boolean {
    return rows.some(
      (row) =>
        row['Selection ID'] === selectionId &&
        row['Voting Method'] === votingMethod &&
        row['Votes'] === votes.toString()
    );
  }

  // check initial export, without wia and manual data
  const { rows: rowsInitial } = await getParsedExport({
    apiClient,
    groupBy,
  });

  // initial official candidate counts
  expect(
    rowExists(rowsInitial, officialCandidateId, 'Precinct', 30)
  ).toBeTruthy();
  expect(
    rowExists(rowsInitial, officialCandidateId, 'Absentee', 30)
  ).toBeTruthy();

  // initial generic write-in counts
  expect(rowExists(rowsInitial, 'write-in', 'Absentee', 28)).toBeTruthy();
  expect(rowExists(rowsInitial, 'write-in', 'Precinct', 28)).toBeTruthy();

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
            [officialCandidateId]: 10,
          },
        },
      },
    }),
  });

  // adjudicate write-ins for unofficial candidate
  const writeInCandidate = await apiClient.addWriteInCandidate({
    contestId: candidateContestId,
    name: 'Mr. Pickles',
  });
  const writeInIds = await apiClient.getWriteInAdjudicationQueue({
    contestId: candidateContestId,
  });
  for (const writeInId of writeInIds) {
    await apiClient.adjudicateWriteIn({
      writeInId,
      type: 'write-in-candidate',
      candidateId: writeInCandidate.id,
    });
  }

  // check final export, with wia and manual data
  const { rows: rowsFinal } = await getParsedExport({
    apiClient,
    groupBy,
  });

  // final official candidate counts
  expect(
    rowExists(rowsFinal, officialCandidateId, 'Precinct', 30)
  ).toBeTruthy();
  expect(
    rowExists(rowsFinal, officialCandidateId, 'Absentee', 40)
  ).toBeTruthy(); // manual data reflected

  // added write-in candidate counts
  expect(
    rowExists(rowsFinal, writeInCandidate.id, 'Absentee', 28)
  ).toBeTruthy();
  expect(
    rowExists(rowsFinal, writeInCandidate.id, 'Precinct', 28)
  ).toBeTruthy();

  // generic write-in counts should be gone
  expect(
    rowsFinal.some(
      (r) =>
        r['Contest ID'] === candidateContestId &&
        r['Selection ID'] === 'write-in'
    )
  ).toBeFalsy();
});

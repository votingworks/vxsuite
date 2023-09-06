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
import { Tabulation, safeParse, CVR as CVRType } from '@votingworks/types';
import { Client } from '@votingworks/grout';
import { vxBallotType } from '@votingworks/types/src/cdf/cast-vote-records';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';
import { Api } from './app';
import { modifyCastVoteRecordReport } from '../test/utils';

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

async function exportResultsSnippet({
  apiClient,
  groupBy,
  filter,
  numLines,
}: {
  apiClient: Client<Api>;
  groupBy?: Tabulation.GroupBy;
  filter?: Tabulation.Filter;
  numLines?: number;
}): Promise<string[]> {
  const path = tmpNameSync();
  const precinctGroupedExportResult = await apiClient.exportResultsCsv({
    path,
    groupBy,
    filter,
  });
  expect(precinctGroupedExportResult.isOk()).toEqual(true);
  return readFileSync(path, 'utf-8').toString().split('\n').slice(0, numLines);
}

it('exports expected results, without splits or filter', async () => {
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
  const header = fileContent.split('\n')[0];
  expect(header).toMatchInlineSnapshot(
    `"Contest,Contest ID,Selection,Selection ID,Votes"`
  );
  const bestAnimalMammalRows = fileContent
    .split('\n')
    .filter((line) => line.includes('best-animal-mammal'));
  expect(bestAnimalMammalRows).toMatchInlineSnapshot(`
      [
        "Best Animal,best-animal-mammal,Horse,horse,4",
        "Best Animal,best-animal-mammal,Otter,otter,4",
        "Best Animal,best-animal-mammal,Fox,fox,36",
        "Best Animal,best-animal-mammal,Overvotes,overvotes,8",
        "Best Animal,best-animal-mammal,Undervotes,undervotes,4",
      ]
    `);
  const fishingRows = fileContent
    .split('\n')
    .filter((line) => line.includes('fishing'));
  expect(fishingRows).toMatchInlineSnapshot(`
    [
      "Ballot Measure 3,fishing,YES,ban-fishing,8",
      "Ballot Measure 3,fishing,NO,allow-fishing,8",
      "Ballot Measure 3,fishing,Overvotes,overvotes,8",
      "Ballot Measure 3,fishing,Undervotes,undervotes,88",
    ]
  `);
});

it('exports 0s if no results are loaded', async () => {
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;

  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const path = tmpNameSync();
  const exportResult = await apiClient.exportResultsCsv({ path });
  expect(exportResult.isOk()).toEqual(true);

  const fileContent = readFileSync(path, 'utf-8').toString();
  const header = fileContent.split('\n')[0];
  expect(header).toMatchInlineSnapshot(
    `"Contest,Contest ID,Selection,Selection ID,Votes"`
  );
  const bestAnimalMammalRows = fileContent
    .split('\n')
    .filter((line) => line.includes('best-animal-mammal'));
  expect(bestAnimalMammalRows).toMatchInlineSnapshot(`
      [
        "Best Animal,best-animal-mammal,Horse,horse,0",
        "Best Animal,best-animal-mammal,Otter,otter,0",
        "Best Animal,best-animal-mammal,Fox,fox,0",
        "Best Animal,best-animal-mammal,Overvotes,overvotes,0",
        "Best Animal,best-animal-mammal,Undervotes,undervotes,0",
      ]
    `);
  const fishingRows = fileContent
    .split('\n')
    .filter((line) => line.includes('fishing'));
  expect(fishingRows).toMatchInlineSnapshot(`
    [
      "Ballot Measure 3,fishing,YES,ban-fishing,0",
      "Ballot Measure 3,fishing,NO,allow-fishing,0",
      "Ballot Measure 3,fishing,Overvotes,overvotes,0",
      "Ballot Measure 3,fishing,Undervotes,undervotes,0",
    ]
  `);
});

it('logs failure if export fails for some reason', async () => {
  const { electionDefinition, castVoteRecordReport } =
    electionMinimalExhaustiveSampleFixtures;

  const { apiClient, auth, logger } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordReport.asDirectoryPath(),
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

it('uses appropriate file headers based on group by', async () => {
  const { electionDefinition, castVoteRecordReport } =
    electionMinimalExhaustiveSampleFixtures;
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordReport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  // test each grouping individually

  expect(
    await exportResultsSnippet({
      apiClient,
      groupBy: { groupByPrecinct: true },
      numLines: 2,
    })
  ).toMatchInlineSnapshot(`
      [
        "Precinct,Precinct ID,Contest,Contest ID,Selection,Selection ID,Votes",
        "Precinct 1,precinct-1,Best Animal,best-animal-mammal,Horse,horse,2",
      ]
    `);

  expect(
    await exportResultsSnippet({
      apiClient,
      groupBy: { groupByBatch: true },
      numLines: 2,
    })
  ).toMatchInlineSnapshot(`
      [
        "Scanner ID,Batch ID,Contest,Contest ID,Selection,Selection ID,Votes",
        "VX-00-000,9822c71014,Best Animal,best-animal-mammal,Horse,horse,4",
      ]
    `);

  expect(
    await exportResultsSnippet({
      apiClient,
      groupBy: { groupByScanner: true },
      numLines: 2,
    })
  ).toMatchInlineSnapshot(`
      [
        "Scanner ID,Contest,Contest ID,Selection,Selection ID,Votes",
        "VX-00-000,Best Animal,best-animal-mammal,Horse,horse,4",
      ]
    `);

  expect(
    await exportResultsSnippet({
      apiClient,
      groupBy: { groupByBallotStyle: true },
      numLines: 2,
    })
  ).toMatchInlineSnapshot(`
      [
        "Party,Party ID,Ballot Style ID,Contest,Contest ID,Selection,Selection ID,Votes",
        "Mammal,0,1M,Best Animal,best-animal-mammal,Horse,horse,4",
      ]
    `);

  expect(
    await exportResultsSnippet({
      apiClient,
      groupBy: { groupByParty: true },
      numLines: 2,
    })
  ).toMatchInlineSnapshot(`
      [
        "Party,Party ID,Contest,Contest ID,Selection,Selection ID,Votes",
        "Mammal,0,Best Animal,best-animal-mammal,Horse,horse,4",
      ]
    `);

  expect(
    await exportResultsSnippet({
      apiClient,
      groupBy: { groupByVotingMethod: true },
      numLines: 2,
    })
  ).toMatchInlineSnapshot(`
      [
        "Voting Method,Contest,Contest ID,Selection,Selection ID,Votes",
        "Precinct,Best Animal,best-animal-mammal,Horse,horse,2",
      ]
    `);

  // try a combination

  expect(
    await exportResultsSnippet({
      apiClient,
      groupBy: { groupByPrecinct: true, groupByVotingMethod: true },
      numLines: 2,
    })
  ).toMatchInlineSnapshot(`
      [
        "Voting Method,Precinct,Precinct ID,Contest,Contest ID,Selection,Selection ID,Votes",
        "Precinct,Precinct 1,precinct-1,Best Animal,best-animal-mammal,Horse,horse,1",
      ]
    `);
});

it('incorporates wia and manual data', async () => {
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

  // imitate common export splits
  const groupBy: Tabulation.GroupBy = {
    groupByPrecinct: true,
    groupByVotingMethod: true,
  };
  const candidateContestId =
    'State-Representatives-Hillsborough-District-34-b1012d38';
  const officialCandidateId = 'Obadiah-Carrigan-5c95145a';

  // export without wia and manual data
  const resultsExportInitial = await exportResultsSnippet({
    apiClient,
    groupBy,
  });
  const linesCandidateContest = resultsExportInitial.filter((line) =>
    line.includes(candidateContestId)
  );
  const officialCandidateCounts = linesCandidateContest
    .filter((line) => line.includes(officialCandidateId))
    .map((line) => line.split(','))
    .map((values) => [values[0], values.pop()]);
  expect(officialCandidateCounts).toEqual([
    ['Precinct', '30'],
    ['Absentee', '30'],
  ]);
  const genericWriteInCounts = linesCandidateContest
    .filter((line) => line.includes(',write-in,'))
    .map((line) => line.split(','))
    .map((values) => [values[0], values.pop()]);
  expect(genericWriteInCounts).toEqual([
    ['Precinct', '28'],
    ['Absentee', '28'],
  ]);

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

  // export with wia and manual data
  const resultsExportFinal = await exportResultsSnippet({
    apiClient,
    groupBy,
  });
  const linesCandidateContest2 = resultsExportFinal.filter((line) =>
    line.includes(candidateContestId)
  );
  const officialCandidateCounts2 = linesCandidateContest2
    .filter((line) => line.includes(officialCandidateId))
    .map((line) => line.split(','))
    .map((values) => [values[0], values.pop()]);
  expect(officialCandidateCounts2).toEqual([
    ['Precinct', '30'],
    ['Absentee', '40'], // manual data reflected
  ]);
  const unofficialCandidateCounts2 = linesCandidateContest2
    .filter((line) => line.includes(writeInCandidate.id))
    .map((line) => line.split(','))
    .map((values) => [values[0], values.pop()]);
  expect(unofficialCandidateCounts2).toEqual([
    ['Precinct', '28'], // unofficial candidate data included
    ['Absentee', '28'],
  ]);
  expect(
    linesCandidateContest2.filter((line) => line.includes(',write-in,'))
  ).toHaveLength(0);
});

it('populates empty splits with data', async () => {
  const { electionDefinition, castVoteRecordReport } =
    electionGridLayoutNewHampshireAmherstFixtures;

  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);

  // alter fixture so there are no absentee CVRs
  const reportDirectoryPath = await modifyCastVoteRecordReport(
    castVoteRecordReport.asDirectoryPath(),
    ({ CVR }) => ({
      CVR: CVR.map((unparsed) => {
        return {
          ...safeParse(CVRType.CVRSchema, unparsed).unsafeUnwrap(),
          vxBallotType: vxBallotType.Precinct,
        };
      }),
    })
  );

  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: reportDirectoryPath,
  });
  loadFileResult.assertOk('load file failed');

  // imitate common export splits
  const groupBy: Tabulation.GroupBy = {
    groupByVotingMethod: true,
  };

  // export without wia and manual data
  const resultsExport = await exportResultsSnippet({
    apiClient,
    groupBy,
  });

  let hasAbsenteeRows = false;
  for (const line of resultsExport) {
    if (line.includes('Absentee')) {
      hasAbsenteeRows = true;
      expect(line.endsWith('0')).toBeTruthy();
    }
  }
  expect(hasAbsenteeRows).toBeTruthy();
});

it('adjusts included contests based on splits', async () => {
  const { electionDefinition, castVoteRecordReport } =
    electionMinimalExhaustiveSampleFixtures;

  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordReport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  const resultsExport = await exportResultsSnippet({
    apiClient,
    groupBy: { groupByBallotStyle: true },
  });

  // mammal ballot style entries should include mammal and nonpartisan contests, but not fish
  expect(
    resultsExport.some(
      (line) => line.includes('1M') && line.includes('best-animal-mammal')
    )
  ).toBeTruthy();
  expect(
    resultsExport.some(
      (line) => line.includes('1M') && line.includes('fishing')
    )
  ).toBeTruthy();
  expect(
    resultsExport.some(
      (line) => line.includes('1M') && line.includes('best-animal-fish')
    )
  ).toBeFalsy();

  // fish ballot style entries should include fish and nonpartisan contests, but not mammal
  expect(
    resultsExport.some(
      (line) => line.includes('2F') && line.includes('best-animal-mammal')
    )
  ).toBeFalsy();
  expect(
    resultsExport.some(
      (line) => line.includes('2F') && line.includes('fishing')
    )
  ).toBeTruthy();
  expect(
    resultsExport.some(
      (line) => line.includes('2F') && line.includes('best-animal-fish')
    )
  ).toBeTruthy();
});

it('adjusts included contests based on filter', async () => {
  const { electionDefinition, castVoteRecordReport } =
    electionMinimalExhaustiveSampleFixtures;

  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordReport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  const resultsExport = await exportResultsSnippet({
    apiClient,
    filter: { ballotStyleIds: ['1M'] },
  });

  expect(
    resultsExport.some((line) => line.includes('best-animal-mammal'))
  ).toBeTruthy();
  expect(
    resultsExport.some((line) => line.includes('best-animal-fish'))
  ).toBeFalsy();
});

it('does not include splits when they are excluded by the filter', async () => {
  const { electionDefinition, castVoteRecordReport } =
    electionMinimalExhaustiveSampleFixtures;

  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordReport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  // splitting by voting method should include absentee splits
  const resultsExportAll = await exportResultsSnippet({
    apiClient,
    groupBy: { groupByVotingMethod: true },
  });
  expect(
    resultsExportAll.some((line) => line.includes('Absentee'))
  ).toBeTruthy();

  // but if we filter out precinct ballots, we should be smart enough to not include absentee splits
  const resultsExportAbsenteeOnly = await exportResultsSnippet({
    apiClient,
    groupBy: { groupByVotingMethod: true },
    filter: { votingMethods: ['precinct'] },
  });
  expect(
    resultsExportAbsenteeOnly.some((line) => line.includes('Absentee'))
  ).toBeFalsy();
});

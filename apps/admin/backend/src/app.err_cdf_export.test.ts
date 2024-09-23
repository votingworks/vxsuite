import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import {
  BooleanEnvironmentVariableName,
  buildManualResultsFixture,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { tmpNameSync } from 'tmp';
import { readFileSync } from 'node:fs';
import { LogEventId } from '@votingworks/logging';
import {
  CVR,
  CandidateContest,
  ResultsReporting,
  Tabulation,
  safeParse,
  safeParseJson,
} from '@votingworks/types';
import { assert, assertDefined, find } from '@votingworks/basics';
import { Client } from '@votingworks/grout';
import { modifyCastVoteRecordExport } from '@votingworks/backend';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';
import { Api } from '.';

jest.setTimeout(60_000);

// mock SKIP_CVR_BALLOT_HASH_CHECK to allow us to use old cvr fixtures
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
    BooleanEnvironmentVariableName.SKIP_CVR_BALLOT_HASH_CHECK
  );
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CAST_VOTE_RECORDS_AUTHENTICATION
  );
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

it('logs success if export succeeds', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;

  const { apiClient, auth, logger } = await buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  const offLimitsPath = '/root/hidden';
  const failedExportResult = await apiClient.exportCdfElectionResultsReport({
    path: offLimitsPath,
  });
  expect(failedExportResult.isErr()).toEqual(true);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    {
      disposition: 'failure',
      filename: offLimitsPath,
      message: `Failed to save CDF election results report JSON file to ${offLimitsPath} on the USB drive.`,
    }
  );
});

it('logs failure if export fails', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;

  const { apiClient, auth, logger } = await buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  const path = tmpNameSync();
  const exportResult = await apiClient.exportCdfElectionResultsReport({
    path,
  });
  expect(exportResult.isOk()).toEqual(true);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    {
      disposition: 'success',
      filename: path,
      message: `Saved CDF election results report JSON file to ${path} on the USB drive.`,
    }
  );
});

async function getCurrentReport(
  apiClient: Client<Api>
): Promise<ResultsReporting.ElectionReport> {
  const path = tmpNameSync();

  const exportResult = await apiClient.exportCdfElectionResultsReport({ path });
  exportResult.assertOk('CDF results report export failed');

  const json = readFileSync(path, 'utf-8').toString();

  return safeParse(
    ResultsReporting.ElectionReportSchema,
    safeParseJson(json).unsafeUnwrap()
  ).unsafeUnwrap();
}

it('exports results and metadata accurately', async () => {
  const { electionDefinition, castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { election } = electionDefinition;

  const { apiClient, auth } = await buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  // add CVR data
  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordExport.asDirectoryPath(),
  });
  loadFileResult.unsafeUnwrap();

  // adjudicate a write-in
  const candidateContestId =
    'State-Representatives-Hillsborough-District-34-b1012d38';
  const officialCandidateId = 'Obadiah-Carrigan-5c95145a';
  const writeInCandidate1 = await apiClient.addWriteInCandidate({
    contestId: candidateContestId,
    name: 'Mr. Jerry',
  });
  const [writeInId1, writeInId2] = await apiClient.getWriteInAdjudicationQueue({
    contestId: candidateContestId,
  });
  assert(writeInId1 !== undefined);
  assert(writeInId2 !== undefined);
  await apiClient.adjudicateWriteIn({
    writeInId: writeInId1,
    type: 'write-in-candidate',
    candidateId: writeInCandidate1.id,
  });
  await apiClient.adjudicateWriteIn({
    writeInId: writeInId2,
    type: 'official-candidate',
    candidateId: officialCandidateId,
  });

  // add manual data
  const writeInCandidate2 = await apiClient.addWriteInCandidate({
    contestId: candidateContestId,
    name: 'Mr. Kennedy',
  });
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
          overvotes: 1,
          undervotes: 1,
          officialOptionTallies: {
            [officialCandidateId]: 5,
          },
          writeInOptionTallies: {
            [writeInCandidate1.id]: {
              name: writeInCandidate1.name,
              tally: 2,
            },
            [writeInCandidate2.id]: {
              name: writeInCandidate2.name,
              tally: 1,
            },
          },
        },
      },
    }),
  });

  const { Party, Election, GpUnit, ...reportMetadata } =
    await getCurrentReport(apiClient);

  expect(reportMetadata).toMatchObject({
    '@type': 'ElectionResults.ElectionReport',
    Format: 'summary-contest',
    GeneratedDate: expect.anything(),
    IsTest: true,
    Issuer: 'Test Ballot',
    IssuerAbbreviation: '00701',
    SequenceEnd: 1,
    SequenceStart: 1,
    Status: 'unofficial-complete',
    VendorApplicationId: 'VxAdmin, version dev',
  });
  expect(GpUnit?.map((gpUnit) => gpUnit['@id'])).toEqual([
    'nh',
    '00701',
    'town-id-00701-precinct-id-default',
  ]);
  expect(Party?.map((gpUnit) => gpUnit['@id'])).toEqual([
    'Democratic-aea20adb',
    'Republican-f0167ce7',
    'OC-3a386d2b',
  ]);
  assert(Election);
  const { Candidate, Contest, BallotCounts, ...electionMetadata } =
    assertDefined(Election[0]);
  expect(electionMetadata).toEqual({
    '@type': 'ElectionResults.Election',
    ElectionScopeId: 'nh',
    EndDate: '2022-07-12',
    Name: {
      '@type': 'ElectionResults.InternationalizedText',
      Text: [
        {
          '@type': 'ElectionResults.LanguageString',
          Content: 'General Election',
          Language: 'en',
        },
      ],
    },
    StartDate: '2022-07-12',
    Type: 'general',
  });
  expect(BallotCounts).toHaveLength(1);
  expect(BallotCounts![0]).toEqual({
    '@type': 'ElectionResults.BallotCounts',
    BallotsCast: 194, // includes manual ballot count
    GpUnitId: '00701',
    Type: 'total',
  });
  const expectedOfficialCandidateIds = election.contests
    .filter(
      (contest): contest is CandidateContest => contest.type === 'candidate'
    )
    .flatMap((contest) => contest.candidates)
    .map((candidate) => candidate.id)
    .sort();
  expect(Candidate?.map((c) => c['@id']).sort()).toEqual(
    [
      ...expectedOfficialCandidateIds,
      writeInCandidate1.id,
      writeInCandidate2.id,
      Tabulation.GENERIC_WRITE_IN_ID,
    ].sort()
  );

  assert(Contest);
  const ballotMeasureContestId =
    'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc';
  const ballotMeasureContest = find(
    Contest,
    (c) => c['@id'] === ballotMeasureContestId
  );

  function expectedCount(num: number) {
    return expect.objectContaining({
      '@type': 'ElectionResults.VoteCounts',
      Count: num,
      GpUnitId: 'town-id-00701-precinct-id-default',
      Type: 'total',
    });
  }

  expect(ballotMeasureContest).toEqual({
    '@id':
      'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc',
    '@type': 'ElectionResults.BallotMeasureContest',
    ContestSelection: [
      {
        '@id':
          'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc-option-yes',
        '@type': 'ElectionResults.BallotMeasureSelection',
        Selection: {
          '@type': 'ElectionResults.InternationalizedText',
          Text: [
            {
              '@type': 'ElectionResults.LanguageString',
              Content: 'Yes',
              Language: 'en',
            },
          ],
        },
        VoteCounts: [expectedCount(2)],
      },
      {
        '@id':
          'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc-option-no',
        '@type': 'ElectionResults.BallotMeasureSelection',
        Selection: {
          '@type': 'ElectionResults.InternationalizedText',
          Text: [
            {
              '@type': 'ElectionResults.LanguageString',
              Content: 'No',
              Language: 'en',
            },
          ],
        },
        VoteCounts: [expectedCount(2)],
      },
    ],
    ElectionDistrictId: 'town-id-00701-precinct-id-default',
    Name: 'Constitutional Amendment Question #1',
    OtherCounts: [
      {
        '@type': 'ElectionResults.OtherCounts',
        GpUnitId: 'town-id-00701-precinct-id-default',
        Overvotes: 2,
        Undervotes: 178,
      },
    ],
  });

  const candidateContest = find(
    Contest,
    (c) => c['@id'] === candidateContestId
  );

  expect(candidateContest).toEqual({
    '@id': 'State-Representatives-Hillsborough-District-34-b1012d38',
    '@type': 'ElectionResults.CandidateContest',
    ContestSelection: expect.arrayContaining([
      {
        '@id': 'Obadiah-Carrigan-5c95145a',
        '@type': 'ElectionResults.CandidateSelection',
        VoteCounts: [expectedCount(66)],
      },
      {
        '@id': 'write-in',
        '@type': 'ElectionResults.CandidateSelection',
        IsWriteIn: true,
        VoteCounts: [expectedCount(54)],
      },
      {
        '@id': writeInCandidate1.id,
        '@type': 'ElectionResults.CandidateSelection',
        IsWriteIn: true,
        VoteCounts: [expectedCount(3)],
      },
      {
        '@id': writeInCandidate2.id,
        '@type': 'ElectionResults.CandidateSelection',
        IsWriteIn: true,
        VoteCounts: [expectedCount(1)],
      },
    ]),
    ElectionDistrictId: 'town-id-00701-precinct-id-default',
    Name: 'State Representatives  Hillsborough District 34',
    OtherCounts: [
      {
        '@type': 'ElectionResults.OtherCounts',
        GpUnitId: 'town-id-00701-precinct-id-default',
        Overvotes: 31,
        Undervotes: 13,
      },
    ],
    VotesAllowed: 3,
  });
});

it('marks report as certified when official, as primary when primary, and as non-test when official files loaded', async () => {
  const { electionDefinition, castVoteRecordExport } =
    electionTwoPartyPrimaryFixtures;

  const { apiClient, auth } = await buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  // add CVR data, as non-test file
  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: await modifyCastVoteRecordExport(
      castVoteRecordExport.asDirectoryPath(),
      {
        castVoteRecordReportMetadataModifier: (
          castVoteRecordReportMetadata
        ) => ({
          ...castVoteRecordReportMetadata,
          OtherReportType: undefined,
          ReportType: [CVR.ReportType.OriginatingDeviceExport],
        }),
      }
    ),
  });
  loadFileResult.unsafeUnwrap();

  await apiClient.markResultsOfficial();

  const { IsTest, Election, Status } = await getCurrentReport(apiClient);

  expect(IsTest).toEqual(false);
  expect(Election?.[0]?.Type).toEqual(ResultsReporting.ElectionType.Primary);
  expect(Status).toEqual(ResultsReporting.ResultsStatus.Certified);
});

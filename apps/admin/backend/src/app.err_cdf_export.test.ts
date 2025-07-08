import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import {
  BooleanEnvironmentVariableName,
  buildManualResultsFixture,
  getFeatureFlagMock,
} from '@votingworks/utils';
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
import { assert, assertDefined, err, find, ok } from '@votingworks/basics';
import { Client } from '@votingworks/grout';
import { modifyCastVoteRecordExport } from '@votingworks/backend';
import { MockUsbDrive } from '@votingworks/usb-drive';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';
import { Api } from '.';
import { mockFileName } from '../test/csv';
import { generateReportPath } from './util/filenames';

vi.setConfig({
  testTimeout: 60_000,
});

// mock SKIP_CVR_BALLOT_HASH_CHECK to allow us to use old cvr fixtures
const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

beforeEach(() => {
  vi.clearAllMocks();
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

test('logs failure if export fails', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();

  const { apiClient, auth, logger, mockUsbDrive } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  mockUsbDrive.insertUsbDrive({});
  mockUsbDrive.removeUsbDrive();

  const filename = mockFileName('json');
  const failedExportResult = await apiClient.exportCdfElectionResultsReport({
    filename,
  });
  expect(failedExportResult).toEqual(err(expect.anything()));
  const usbRelativeFilePath = generateReportPath(electionDefinition, filename);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    {
      disposition: 'failure',
      path: usbRelativeFilePath,
      message: `Failed to save CDF election results report JSON file to ${usbRelativeFilePath} on the USB drive.`,
    }
  );
});

test('logs success if export succeeds', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();

  const { apiClient, auth, logger, mockUsbDrive } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  mockUsbDrive.insertUsbDrive({});
  mockUsbDrive.usbDrive.sync.expectCallWith().resolves();

  const filename = mockFileName('json');
  const exportResult = await apiClient.exportCdfElectionResultsReport({
    filename,
  });
  expect(exportResult).toEqual(ok(expect.anything()));
  const usbRelativeFilePath = generateReportPath(electionDefinition, filename);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    {
      disposition: 'success',
      path: usbRelativeFilePath,
      message: `Saved CDF election results report JSON file to ${usbRelativeFilePath} on the USB drive.`,
    }
  );
});

async function getCurrentReport(
  apiClient: Client<Api>,
  mockUsbDrive: MockUsbDrive
): Promise<ResultsReporting.ElectionReport> {
  const filename = mockFileName('json');

  mockUsbDrive.usbDrive.sync.expectCallWith().resolves();
  const exportResult = await apiClient.exportCdfElectionResultsReport({
    filename,
  });
  exportResult.assertOk('CDF results report export failed');
  const [filePath] = exportResult.unsafeUnwrap();

  const json = readFileSync(filePath!, 'utf-8').toString();

  return safeParse(
    ResultsReporting.ElectionReportSchema,
    safeParseJson(json).unsafeUnwrap()
  ).unsafeUnwrap();
}

test('exports results and metadata accurately', async () => {
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { election } = electionDefinition;

  const { apiClient, auth, mockUsbDrive } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  mockUsbDrive.insertUsbDrive({});

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
  const [writeIn1, writeIn2] = await apiClient.getWriteIns({
    contestId: candidateContestId,
  });
  assert(writeIn1 !== undefined);
  assert(writeIn2 !== undefined);

  await apiClient.adjudicateCvrContest({
    adjudicatedContestOptionById: {
      [writeIn1.optionId]: {
        hasVote: true,
        type: 'write-in-option',
        candidateName: writeInCandidate1.name,
        candidateType: 'write-in-candidate',
      },
    },
    contestId: candidateContestId,
    cvrId: writeIn1.cvrId,
    side: 'front',
  });

  await apiClient.adjudicateCvrContest({
    adjudicatedContestOptionById: {
      [writeIn2.optionId]: {
        hasVote: true,
        type: 'write-in-option',
        candidateId: officialCandidateId,
        candidateType: 'official-candidate',
      },
    },
    contestId: candidateContestId,
    cvrId: writeIn2.cvrId,
    side: 'front',
  });

  // add manual data
  const writeInCandidate2 = await apiClient.addWriteInCandidate({
    contestId: candidateContestId,
    name: 'Mr. Kennedy',
  });
  await apiClient.setManualResults({
    precinctId: election.precincts[0]!.id,
    votingMethod: 'absentee',
    ballotStyleGroupId: election.ballotStyles[0]!.groupId,
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

  const { Party, Election, GpUnit, ...reportMetadata } = await getCurrentReport(
    apiClient,
    mockUsbDrive
  );

  expect(reportMetadata).toMatchObject({
    '@type': 'ElectionResults.ElectionReport',
    Format: 'summary-contest',
    GeneratedDate: expect.anything(),
    IsTest: true,
    Issuer: 'Test Ballot',
    IssuerAbbreviation: 'vx_00701',
    SequenceEnd: 1,
    SequenceStart: 1,
    Status: 'unofficial-complete',
    VendorApplicationId: 'VxAdmin, version dev',
  });
  expect(GpUnit?.map((gpUnit) => gpUnit['@id'])).toEqual([
    'vx_nh',
    'vx_00701',
    'vx_town-id-00701-precinct-id-default',
  ]);
  expect(Party?.map((gpUnit) => gpUnit['@id'])).toEqual([
    'vx_Democratic-aea20adb',
    'vx_Republican-f0167ce7',
    'vx_OC-3a386d2b',
  ]);
  assert(Election);
  const { Candidate, Contest, BallotCounts, ...electionMetadata } =
    assertDefined(Election[0]);
  expect(electionMetadata).toEqual({
    '@type': 'ElectionResults.Election',
    ElectionScopeId: 'vx_nh',
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
    GpUnitId: 'vx_00701',
    Type: 'total',
  });
  const expectedOfficialCandidateIds = election.contests
    .filter(
      (contest): contest is CandidateContest => contest.type === 'candidate'
    )
    .flatMap((contest) => contest.candidates)
    .map((candidate) => `vx_${candidate.id}`)
    .sort();
  expect(Candidate?.map((c) => c['@id']).sort()).toEqual(
    [
      ...expectedOfficialCandidateIds,
      `vx_${writeInCandidate1.id}`,
      `vx_${writeInCandidate2.id}`,
      Tabulation.GENERIC_WRITE_IN_ID,
    ].sort()
  );

  assert(Contest);
  const ballotMeasureContestId =
    'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc';
  const ballotMeasureContest = find(
    Contest,
    (c) => c['@id'] === `vx_${ballotMeasureContestId}`
  );

  function expectedCount(num: number) {
    return expect.objectContaining({
      '@type': 'ElectionResults.VoteCounts',
      Count: num,
      GpUnitId: 'vx_town-id-00701-precinct-id-default',
      Type: 'total',
    });
  }

  expect(ballotMeasureContest).toEqual({
    '@id':
      'vx_Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc',
    '@type': 'ElectionResults.BallotMeasureContest',
    ContestSelection: [
      {
        '@id':
          'vx_Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc-option-yes',
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
          'vx_Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc-option-no',
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
    ElectionDistrictId: 'vx_town-id-00701-precinct-id-default',
    Name: 'Constitutional Amendment Question #1',
    OtherCounts: [
      {
        '@type': 'ElectionResults.OtherCounts',
        GpUnitId: 'vx_town-id-00701-precinct-id-default',
        Overvotes: 2,
        Undervotes: 178,
      },
    ],
  });

  const candidateContest = find(
    Contest,
    (c) => c['@id'] === `vx_${candidateContestId}`
  );

  const contestId = 'State-Representatives-Hillsborough-District-34-b1012d38';

  expect(candidateContest).toEqual({
    '@id': `vx_${contestId}`,
    '@type': 'ElectionResults.CandidateContest',
    ContestSelection: expect.arrayContaining([
      {
        '@id': `vx_${contestId}_Obadiah-Carrigan-5c95145a`,
        '@type': 'ElectionResults.CandidateSelection',
        CandidateIds: ['vx_Obadiah-Carrigan-5c95145a'],
        VoteCounts: [expectedCount(66)],
      },
      {
        '@id': `vx_${contestId}_write-in`,
        '@type': 'ElectionResults.CandidateSelection',
        CandidateIds: ['vx_write-in'],
        IsWriteIn: true,
        VoteCounts: [expectedCount(54)],
      },
      {
        '@id': `vx_${contestId}_${writeInCandidate1.id}`,
        '@type': 'ElectionResults.CandidateSelection',
        CandidateIds: [`vx_${writeInCandidate1.id}`],
        IsWriteIn: true,
        VoteCounts: [expectedCount(3)],
      },
      {
        '@id': `vx_${contestId}_${writeInCandidate2.id}`,
        '@type': 'ElectionResults.CandidateSelection',
        CandidateIds: [`vx_${writeInCandidate2.id}`],
        IsWriteIn: true,
        VoteCounts: [expectedCount(1)],
      },
    ]),
    ElectionDistrictId: 'vx_town-id-00701-precinct-id-default',
    Name: 'State Representatives  Hillsborough District 34',
    OtherCounts: [
      {
        '@type': 'ElectionResults.OtherCounts',
        GpUnitId: 'vx_town-id-00701-precinct-id-default',
        Overvotes: 31,
        Undervotes: 13,
      },
    ],
    VotesAllowed: 3,
  });
});

test('marks report as certified when official, as primary when primary, and as non-test when official files loaded', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { castVoteRecordExport } = electionTwoPartyPrimaryFixtures;

  const { apiClient, auth, mockUsbDrive } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  mockUsbDrive.insertUsbDrive({});

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

  const { IsTest, Election, Status } = await getCurrentReport(
    apiClient,
    mockUsbDrive
  );

  expect(IsTest).toEqual(false);
  expect(Election?.[0]?.Type).toEqual(ResultsReporting.ElectionType.Primary);
  expect(Status).toEqual(ResultsReporting.ResultsStatus.Certified);
});

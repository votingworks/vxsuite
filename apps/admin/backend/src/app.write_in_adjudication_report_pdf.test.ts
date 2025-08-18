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
import { HP_LASER_PRINTER_CONFIG, renderToPdf } from '@votingworks/printing';
import { assert, err } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import { BallotStyleGroupId } from '@votingworks/types';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';
import { mockFileName } from '../test/csv';
import { generateReportPath } from './util/filenames';

vi.setConfig({
  testTimeout: 60_000,
});

const reportPrintedTime = new Date('2021-01-01T00:00:00.000');
vi.mock(import('./util/get_current_time.js'), async (importActual) => ({
  ...(await importActual()),
  getCurrentTime: () => reportPrintedTime.getTime(),
}));

vi.mock(import('@votingworks/types'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    formatElectionHashes: vi.fn().mockReturnValue('1111111-0000000'),
  };
});

// mock SKIP_CVR_BALLOT_HASH_CHECK to allow us to use old cvr fixtures
const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

vi.mock(import('@votingworks/printing'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    renderToPdf: vi.fn(original.renderToPdf),
  } as unknown as typeof import('@votingworks/printing');
});

beforeEach(() => {
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

test('write-in adjudication report', async () => {
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { election } = electionDefinition;

  const { apiClient, auth, mockPrinterHandler, mockUsbDrive } =
    buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordExport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  const writeInContestId =
    'State-Representatives-Hillsborough-District-34-b1012d38';

  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  mockUsbDrive.insertUsbDrive({});

  async function expectIdenticalSnapshotsAcrossExportMethods(
    customSnapshotIdentifier: string
  ) {
    const preview = await apiClient.getWriteInAdjudicationReportPreview();
    expect(preview.warning).toBeUndefined();
    await expect(preview.pdf).toMatchPdfSnapshot({
      failureThreshold: 0.0001,
      customSnapshotIdentifier,
    });

    await apiClient.printWriteInAdjudicationReport();
    const printPath = mockPrinterHandler.getLastPrintPath();
    assert(printPath !== undefined);
    await expect(printPath).toMatchPdfSnapshot({
      failureThreshold: 0.0001,
      customSnapshotIdentifier,
    });

    mockUsbDrive.usbDrive.sync.expectCallWith().resolves();
    const filename = mockFileName('pdf');
    const exportResult = await apiClient.exportWriteInAdjudicationReportPdf({
      filename,
    });
    const [filePath] = exportResult.unsafeUnwrap();
    await expect(filePath).toMatchPdfSnapshot({
      failureThreshold: 0.0001,
      customSnapshotIdentifier,
    });
  }

  await expectIdenticalSnapshotsAcrossExportMethods('wia-report-zero');

  const writeIns = await apiClient.getWriteIns({
    contestId: writeInContestId,
  });

  const unofficialCandidate1 = await apiClient.addWriteInCandidate({
    contestId: writeInContestId,
    name: 'Unofficial Candidate 1',
  });

  // generate some adjudication information
  for (const [i, writeIn] of writeIns.entries()) {
    const { optionId, cvrId, contestId } = writeIn;
    if (i < 24) {
      await apiClient.adjudicateCvrContest({
        cvrId,
        contestId,
        side: 'front',
        adjudicatedContestOptionById: {
          [optionId]: {
            type: 'write-in-option',
            candidateName: unofficialCandidate1.name,
            candidateType: 'write-in-candidate',
            hasVote: true,
          },
        },
      });
    } else if (i < 48) {
      await apiClient.adjudicateCvrContest({
        cvrId,
        contestId,
        side: 'front',
        adjudicatedContestOptionById: {
          [optionId]: {
            type: 'write-in-option',
            candidateId: 'Obadiah-Carrigan-5c95145a',
            candidateType: 'official-candidate',
            hasVote: true,
          },
        },
      });
    } else {
      await apiClient.adjudicateCvrContest({
        cvrId,
        contestId,
        side: 'front',
        adjudicatedContestOptionById: {
          [optionId]: {
            type: 'write-in-option',
            hasVote: false,
          },
        },
      });
    }
  }

  await expectIdenticalSnapshotsAcrossExportMethods('wia-report-adjudicated');

  // add manual data
  const unofficialCandidate2 = await apiClient.addWriteInCandidate({
    contestId: writeInContestId,
    name: 'Unofficial Candidate 2',
  });
  await apiClient.setManualResults({
    ballotStyleGroupId: 'card-number-3' as BallotStyleGroupId,
    votingMethod: 'precinct',
    precinctId: 'town-id-00701-precinct-id-default',
    manualResults: buildManualResultsFixture({
      election,
      ballotCount: 25,
      contestResultsSummaries: {
        [writeInContestId]: {
          type: 'candidate',
          ballots: 25,
          overvotes: 3,
          undervotes: 2,
          writeInOptionTallies: {
            [unofficialCandidate1.id]: {
              name: 'Unofficial Candidate 1',
              tally: 6,
            },
            [unofficialCandidate2.id]: {
              name: 'Unofficial Candidate 2',
              tally: 4,
            },
          },
          officialOptionTallies: {
            'Obadiah-Carrigan-5c95145a': 10,
          },
        },
      },
    }),
  });

  await expectIdenticalSnapshotsAcrossExportMethods(
    'wia-report-adjudicated-plus-manual'
  );
});

test('write-in adjudication report logging', async () => {
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();

  const { apiClient, auth, logger, mockPrinterHandler, mockUsbDrive } =
    buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);
  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  mockUsbDrive.insertUsbDrive({});
  mockUsbDrive.usbDrive.sync.expectCallWith().resolves();

  // successful file export
  const validFileName = mockFileName('pdf');
  const validExportResult = await apiClient.exportWriteInAdjudicationReportPdf({
    filename: validFileName,
  });
  validExportResult.assertOk('export should have succeeded');
  const usbRelativeFilePath = generateReportPath(
    electionDefinition,
    validFileName
  );
  expect(logger.log).lastCalledWith(LogEventId.FileSaved, 'election_manager', {
    disposition: 'success',
    message: `Saved write-in adjudication report PDF file to ${usbRelativeFilePath} on the USB drive.`,
    path: usbRelativeFilePath,
  });

  // failed file export
  mockUsbDrive.removeUsbDrive();
  const invalidFilename = mockFileName('pdf');
  const invalidExportResult =
    await apiClient.exportWriteInAdjudicationReportPdf({
      filename: invalidFilename,
    });
  invalidExportResult.assertErr('export should have failed');
  const invalidUsbRelativeFilePath = generateReportPath(
    electionDefinition,
    invalidFilename
  );
  expect(logger.log).lastCalledWith(LogEventId.FileSaved, 'election_manager', {
    disposition: 'failure',
    message: `Failed to save write-in adjudication report PDF file to ${invalidUsbRelativeFilePath} on the USB drive.`,
    path: invalidUsbRelativeFilePath,
  });

  // successful print
  await apiClient.printWriteInAdjudicationReport();
  expect(logger.log).lastCalledWith(
    LogEventId.ElectionReportPrinted,
    'election_manager',
    {
      message: `User printed the write-in adjudication report.`,
      disposition: 'success',
    }
  );

  // failed print
  mockPrinterHandler.disconnectPrinter();
  await apiClient.printWriteInAdjudicationReport();
  expect(logger.log).lastCalledWith(
    LogEventId.ElectionReportPrinted,
    'election_manager',
    {
      message: `Error in attempting to print the write-in adjudication report: cannot print without printer connected`,
      disposition: 'failure',
    }
  );

  // preview
  await apiClient.getWriteInAdjudicationReportPreview();
  expect(logger.log).lastCalledWith(
    LogEventId.ElectionReportPreviewed,
    'election_manager',
    {
      message: `User previewed the write-in adjudication report.`,
      disposition: 'success',
    }
  );
});

test('write-in adjudication report warning', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  vi.mocked(renderToPdf).mockResolvedValueOnce(err('content-too-large'));
  expect(await apiClient.getWriteInAdjudicationReportPreview()).toEqual({
    pdf: undefined,
    warning: { type: 'content-too-large' },
  });
});

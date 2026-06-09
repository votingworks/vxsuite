import { err } from '@votingworks/basics';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { LogEventId } from '@votingworks/logging';
import { HP_LASER_PRINTER_CONFIG, renderToPdf } from '@votingworks/printing';
import {
  BallotType,
  EncodedBallotEntry,
  LanguageCode,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  generateFileTimeSuffix,
  getFeatureFlagMock,
  getMockMultiLanguageElectionDefinition,
} from '@votingworks/utils';
import { join } from 'node:path';
import { beforeAll, beforeEach, expect, vi } from 'vitest';
import { apptest, buildBallotsForElection } from '../test/app';
import {
  exportBallotsPrintedReportPdf,
  generateReportsDirectoryPath,
  printBallotsPrintedReport,
} from './reports/ballots_printed_report';

const mockFeatureFlagger = getFeatureFlagMock();

const electionDefinition = getMockMultiLanguageElectionDefinition(
  electionFamousNames2021Fixtures.readElectionDefinition(),
  [LanguageCode.ENGLISH]
);

let ballots: EncodedBallotEntry[];

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

vi.mock(import('@votingworks/printing'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    renderToPdf: vi.fn(original.renderToPdf),
  } as unknown as typeof import('@votingworks/printing');
});

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
});

apptest(
  'ballots printed report (zero) can be printed and exported (pdf snapshots)',
  async ({
    logger,
    mockPrinterHandler,
    workspace,
    configureMachine,
    insertUsbDrive,
    usbDrive,
  }) => {
    const fixedNow = new Date('2025-12-18T12:00:00.000Z');

    await configureMachine({
      electionDefinition,
      ballots,
    });

    mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
    await printBallotsPrintedReport({
      printer: mockPrinterHandler.printer,
      logger,
      store: workspace.store,
      generatedAtTime: fixedNow,
    });
    await expect(mockPrinterHandler.getLastPrintPath()).toMatchPdfSnapshot({
      customSnapshotIdentifier: 'ballots-printed-report-zero-print',
      failureThreshold: 0.00001,
    });

    insertUsbDrive({});
    await exportBallotsPrintedReportPdf({
      usbDrive,
      logger,
      store: workspace.store,
      generatedAtTime: fixedNow,
    });
    const usbStatus = await usbDrive.status();
    expect(usbStatus.status).toEqual('mounted');
    const { mountPoint } = usbStatus as {
      status: 'mounted';
      mountPoint: string;
    };

    const reportsDir = join(
      mountPoint,
      generateReportsDirectoryPath(electionDefinition)
    );
    const exportedFilename = `ballots-printed-report__${generateFileTimeSuffix(
      fixedNow
    )}.pdf`;
    await expect(join(reportsDir, exportedFilename)).toMatchPdfSnapshot({
      customSnapshotIdentifier: 'ballots-printed-report-zero-export',
      failureThreshold: 0.00001,
    });
  }
);

apptest(
  'ballots printed report (non-zero) can be printed and exported (pdf snapshots)',
  async ({
    apiClient,
    configureMachine,
    insertUsbDrive,
    logger,
    mockPrinterHandler,
    usbDrive,
    workspace,
  }) => {
    const fixedNow = new Date('2025-12-18T12:05:00.000Z');
    await configureMachine({
      electionDefinition,
      ballots,
    });

    mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
    const styleA = electionDefinition.election.ballotStyles[0];
    const styleB = electionDefinition.election.ballotStyles[1];
    const precinctA = styleA.precincts[0];
    const precinctB = styleB.precincts[0];
    await apiClient.printBallot({
      precinctId: precinctA,
      languageCode: LanguageCode.ENGLISH,
      ballotType: BallotType.Precinct,
      copies: 2,
    });
    await apiClient.printBallot({
      precinctId: precinctA,
      languageCode: LanguageCode.ENGLISH,
      ballotType: BallotType.Absentee,
      copies: 1,
    });
    await apiClient.printBallot({
      precinctId: precinctB,
      languageCode: LanguageCode.ENGLISH,
      ballotType: BallotType.Precinct,
      copies: 3,
    });
    await apiClient.printBallot({
      precinctId: precinctB,
      languageCode: LanguageCode.ENGLISH,
      ballotType: BallotType.Absentee,
      copies: 4,
    });

    await printBallotsPrintedReport({
      printer: mockPrinterHandler.printer,
      logger,
      store: workspace.store,
      generatedAtTime: fixedNow,
    });
    await expect(mockPrinterHandler.getLastPrintPath()).toMatchPdfSnapshot({
      customSnapshotIdentifier: 'ballots-printed-report-nonzero-print',
      failureThreshold: 0.00001,
    });

    insertUsbDrive({});
    await exportBallotsPrintedReportPdf({
      usbDrive,
      logger,
      store: workspace.store,
      generatedAtTime: fixedNow,
    });
    const usbStatus = await usbDrive.status();
    expect(usbStatus.status).toEqual('mounted');
    const { mountPoint } = usbStatus as {
      status: 'mounted';
      mountPoint: string;
    };
    const reportsDir = join(
      mountPoint,
      generateReportsDirectoryPath(electionDefinition)
    );
    const exportedFilename = `ballots-printed-report__${generateFileTimeSuffix(
      fixedNow
    )}.pdf`;
    await expect(join(reportsDir, exportedFilename)).toMatchPdfSnapshot({
      customSnapshotIdentifier: 'ballots-printed-report-nonzero-export',
      failureThreshold: 0.00001,
    });
  }
);

apptest(
  'printBallotsPrintedReport logs error when renderToPdf fails',
  async ({ apiClient, configureMachine, logger, mockPrinterHandler }) => {
    await configureMachine({
      electionDefinition,
      ballots,
    });

    mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

    const renderToPdfMock = vi.mocked(renderToPdf);
    renderToPdfMock.mockResolvedValueOnce(err('content-too-large'));

    await apiClient.printBallotsPrintedReport();

    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.FileSaved,
      expect.any(String),
      expect.objectContaining({
        disposition: 'failure',
        message: expect.stringContaining(
          'Failed to render Ballots Printed Report PDF file'
        ),
      })
    );
  }
);

apptest(
  'printBallotsPrintedReport logs error when printer.print throws',
  async ({ apiClient, configureMachine, logger, mockPrinterHandler }) => {
    await configureMachine({
      electionDefinition,
      ballots,
    });

    mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

    const printSpy = vi
      .spyOn(mockPrinterHandler.printer, 'print')
      .mockRejectedValueOnce(new Error('Printer jam'));

    await apiClient.printBallotsPrintedReport();

    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.ElectionReportPrinted,
      expect.any(String),
      expect.objectContaining({
        disposition: 'failure',
        message: expect.stringContaining('Printer jam'),
      })
    );

    printSpy.mockRestore();
  }
);

apptest(
  'exportBallotsPrintedReportPdf logs error when renderToPdf fails',
  async ({ apiClient, configureMachine, logger }) => {
    await configureMachine({
      electionDefinition,
      ballots,
    });

    const renderToPdfMock = vi.mocked(renderToPdf);
    renderToPdfMock.mockResolvedValueOnce(err('content-too-large'));

    await apiClient.exportBallotsPrintedReportPdf();

    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.FileSaved,
      expect.any(String),
      expect.objectContaining({
        disposition: 'failure',
        message: expect.stringContaining(
          'Failed to render Ballots Printed Report PDF file'
        ),
      })
    );
  }
);

apptest(
  'exportBallotsPrintedReportPdf logs failure when USB export fails',
  async ({ apiClient, configureMachine, logger, removeUsbDrive }) => {
    await configureMachine({
      electionDefinition,
      ballots,
    });

    // Simulate USB drive not mounted
    removeUsbDrive();

    await apiClient.exportBallotsPrintedReportPdf();

    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.FileSaved,
      expect.any(String),
      expect.objectContaining({
        disposition: 'failure',
        message: expect.stringContaining('Failed to save'),
      })
    );
  }
);

apptest(
  'printBallotsPrintedReport works in test mode',
  async ({ apiClient, configureMachine, logger, mockPrinterHandler }) => {
    await configureMachine({
      electionDefinition,
      ballots,
    });

    // Enable test mode
    await apiClient.setTestMode({ testMode: true });

    mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

    await apiClient.printBallotsPrintedReport();

    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.ElectionReportPrinted,
      expect.any(String),
      expect.objectContaining({
        disposition: 'success',
      })
    );
  }
);

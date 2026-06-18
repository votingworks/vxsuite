/**
 * End-to-end snapshot tests for printTestDeck. This file deliberately does NOT
 * mock @votingworks/hmpb so that generateMarkOverlay runs for real, producing
 * meaningful ballot PDFs with filled bubbles that can be snapshot-verified.
 */
import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Server } from 'node:http';
import {
  safeParseElectionDefinition,
  BallotType,
  ElectionDefinition,
  EncodedBallotEntry,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  HP_LASER_PRINTER_CONFIG,
  MemoryPrinterHandler,
} from '@votingworks/printing';
import * as grout from '@votingworks/grout';
import { DippedSmartCardAuthApi } from '@votingworks/auth';
import { MockUsbDrive } from '@votingworks/usb-drive';
import { generateTestDeckBallots } from '@votingworks/test-decks';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';
import { Api } from './app';

vi.setConfig({ testTimeout: 90_000 });

const reportPrintedTime = new Date('2021-01-01T00:00:00.000');
vi.mock(import('./util/get_current_time.js'), async (importActual) => ({
  ...(await importActual()),
  getCurrentTime: () => reportPrintedTime.getTime(),
}));

const mockFeatureFlagger = getFeatureFlagMock();

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

let server: Server | undefined;
let apiClient: grout.Client<Api>;
let auth: DippedSmartCardAuthApi;
let mockUsbDrive: MockUsbDrive;
let mockPrinterHandler: MemoryPrinterHandler;

beforeEach(() => {
  mockFeatureFlagger.resetFeatureFlags();
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
  ({ apiClient, auth, mockUsbDrive, mockPrinterHandler, server } =
    buildTestEnvironment());
  mockUsbDrive.usbDrive.sync.expectRepeatedCallsWith().resolves();
});

afterEach(() => {
  mockPrinterHandler?.cleanup();
  server?.close();
  server = undefined;
});

async function loadMsElectionFixture(paperSize: 'letter' | 'legal'): Promise<{
  electionDefinition: ElectionDefinition;
  blankBallotPdf: Buffer;
}> {
  const fixtureDir =
    paperSize === 'letter'
      ? resolve(
          process.cwd(),
          '../../../libs/hmpb/fixtures/ms-general-election'
        )
      : resolve(
          process.cwd(),
          '../../../libs/hmpb/fixtures/nh-general-election/legal'
        );

  const electionDefinition = safeParseElectionDefinition(
    await readFile(join(fixtureDir, 'election.json'), 'utf-8')
  ).unsafeUnwrap();
  const blankBallotPdf = await readFile(join(fixtureDir, 'blank-ballot.pdf'));
  return { electionDefinition, blankBallotPdf };
}

function buildTestDeckBallotEntries(
  electionDefinition: ElectionDefinition,
  blankBallotPdf: Buffer
): EncodedBallotEntry[] {
  const { election } = electionDefinition;
  const encodedBallot = blankBallotPdf.toString('base64');
  const entries: EncodedBallotEntry[] = [];

  for (const ballotStyle of election.ballotStyles) {
    for (const precinctId of ballotStyle.precincts) {
      entries.push(
        {
          ballotStyleId: ballotStyle.id,
          precinctId,
          ballotType: BallotType.Precinct,
          ballotMode: 'test',
          encodedBallot,
        },
        {
          ballotStyleId: ballotStyle.id,
          precinctId,
          ballotType: BallotType.Absentee,
          ballotMode: 'test',
          encodedBallot,
        }
      );
    }
  }
  return entries;
}

test('printTestDeck produces correctly marked letter-size ballots and a tally report', async () => {
  const { electionDefinition, blankBallotPdf } =
    await loadMsElectionFixture('letter');
  const ballots = buildTestDeckBallotEntries(
    electionDefinition,
    blankBallotPdf
  );

  await configureMachine({
    electionDefinition,
    ballots,
    apiClient,
    auth,
    mockUsbDrive,
  });
  mockElectionManagerAuth(auth, electionDefinition);
  await apiClient.setTestMode({ testMode: true });
  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

  await apiClient.printTestDeck({});

  const jobs = mockPrinterHandler.getPrintJobHistory();
  const { election } = electionDefinition;
  const allSpecs = election.precincts.flatMap((precinct) =>
    generateTestDeckBallots({
      election,
      precinctId: precinct.id,
      ballotFormat: 'bubble',
    })
  );
  // ballot PDFs + 1 tally report
  expect(jobs.length).toEqual(allSpecs.length + 1);

  const markedBallotJob = jobs[0];
  expect(Object.keys(allSpecs[0].votes).length).toBeGreaterThan(0);
  const blankBallotJob = jobs[jobs.length - 2];
  const tallyReportJob = jobs[jobs.length - 1];

  await expect(markedBallotJob.filename).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'test-deck-letter-marked-ballot',
    failureThreshold: 0.0001,
  });
  await expect(blankBallotJob.filename).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'test-deck-letter-ballot',
    failureThreshold: 0.0001,
  });
  await expect(tallyReportJob.filename).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'test-deck-letter-tally-report',
    failureThreshold: 0.0001,
  });
});

test('printTestDeck produces legal-size ballot PDFs for a legal-paper election', async () => {
  const { electionDefinition, blankBallotPdf } =
    await loadMsElectionFixture('legal');
  const ballots = buildTestDeckBallotEntries(
    electionDefinition,
    blankBallotPdf
  );

  await configureMachine({
    electionDefinition,
    ballots,
    apiClient,
    auth,
    mockUsbDrive,
  });
  mockElectionManagerAuth(auth, electionDefinition);
  await apiClient.setTestMode({ testMode: true });
  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

  await apiClient.printTestDeck({});

  const jobs = mockPrinterHandler.getPrintJobHistory();
  const { election } = electionDefinition;
  const allSpecs = election.precincts.flatMap((precinct) =>
    generateTestDeckBallots({
      election,
      precinctId: precinct.id,
      ballotFormat: 'bubble',
    })
  );
  expect(jobs.length).toEqual(allSpecs.length + 1);

  expect(Object.keys(allSpecs[0].votes).length).toBeGreaterThan(0);
  await expect(jobs[0].filename).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'test-deck-legal-marked-ballot',
    failureThreshold: 0.0001,
  });
  await expect(jobs[jobs.length - 2].filename).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'test-deck-legal-ballot',
    failureThreshold: 0.0001,
  });
  await expect(jobs[jobs.length - 1].filename).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'test-deck-legal-tally-report',
    failureThreshold: 0.0001,
  });
});

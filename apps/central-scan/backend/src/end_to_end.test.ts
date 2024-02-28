import { buildMockDippedSmartCardAuth } from '@votingworks/auth';
import {
  getCastVoteRecordExportDirectoryPaths,
  readCastVoteRecordExport,
} from '@votingworks/backend';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  CVR,
  DEFAULT_SYSTEM_SETTINGS,
  TEST_JURISDICTION,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  convertCastVoteRecordVotesToTabulationVotes,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { Application } from 'express';
import * as fsExtra from 'fs-extra';
import { Server } from 'http';
import * as grout from '@votingworks/grout';
import request from 'supertest';
import { dirSync } from 'tmp';
import { Logger } from '@votingworks/logging';
import { fakeSessionExpiresAt } from '@votingworks/test-utils';
import getPort from 'get-port';
import { ok, sleep } from '@votingworks/basics';
import { createMockUsbDrive, MockUsbDrive } from '@votingworks/usb-drive';
import { makeMockScanner, MockScanner } from '../test/util/mocks';
import { Api, buildCentralScannerApp } from './app';
import { Importer } from './importer';
import { createWorkspace, Workspace } from './util/workspace';
import { start } from './server';
import { buildMockLogger } from '../test/helpers/setup_app';

// we need more time for ballot interpretation
jest.setTimeout(20000);

// mock SKIP_SCAN_ELECTION_HASH_CHECK to allow us to use old ballot image fixtures
const featureFlagMock = getFeatureFlagMock();
jest.mock('@votingworks/utils', () => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
      featureFlagMock.isEnabled(flag),
  };
});

let app: Application;
let auth: ReturnType<typeof buildMockDippedSmartCardAuth>;
let importer: Importer;
let mockUsbDrive: MockUsbDrive;
let workspace: Workspace;
let scanner: MockScanner;
let logger: Logger;
let apiClient: grout.Client<Api>;
let server: Server;

beforeEach(async () => {
  const port = await getPort();
  auth = buildMockDippedSmartCardAuth();
  workspace = createWorkspace(dirSync().name);
  logger = buildMockLogger(auth, workspace);
  scanner = makeMockScanner();
  importer = new Importer({
    workspace,
    scanner,
    logger,
  });
  mockUsbDrive = createMockUsbDrive();
  app = buildCentralScannerApp({
    auth,
    usbDrive: mockUsbDrive.usbDrive,
    allowedExportPatterns: ['/tmp/**'],
    importer,
    workspace,
    logger,
  });
  const baseUrl = `http://localhost:${port}/api`;
  apiClient = grout.createClient({
    baseUrl,
  });

  server = await start({
    app,
    logger,
    workspace,
    port,
  });
});

afterEach(async () => {
  importer.unconfigure();
  await fsExtra.remove(workspace.path);
  featureFlagMock.resetFeatureFlags();
  server.close();
});

const jurisdiction = TEST_JURISDICTION;

test('going through the whole process works', async () => {
  auth.getAuthStatus.mockResolvedValue({
    status: 'logged_in',
    user: {
      role: 'election_manager',
      jurisdiction,
      electionHash: 'abc',
    },
    sessionExpiresAt: fakeSessionExpiresAt(),
  });

  importer.configure(
    electionFamousNames2021Fixtures.electionDefinition,
    jurisdiction
  );
  workspace.store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);

  await apiClient.setTestMode({ testMode: true });

  {
    // define the next scanner session & scan some sample ballots
    scanner
      .withNextScannerSession()
      .sheet([
        electionFamousNames2021Fixtures.machineMarkedBallotPage1.asFilePath(),
        electionFamousNames2021Fixtures.machineMarkedBallotPage2.asFilePath(),
      ])
      .end();
    await request(app)
      .post('/central-scanner/scan/scanBatch')
      .expect(200)
      .then((response) => {
        expect(response.body).toEqual({
          status: 'ok',
          batchId: expect.any(String),
        });
      });

    await importer.waitForEndOfBatchOrScanningPause();

    // check the status
    const status = await request(app)
      .get('/central-scanner/scan/status')
      .set('Accept', 'application/json')
      .expect(200);

    expect(JSON.parse(status.text).batches[0].count).toEqual(1);
  }

  {
    mockUsbDrive.insertUsbDrive({});

    expect(
      await apiClient.exportCastVoteRecordsToUsbDrive({
        isMinimalExport: true,
      })
    ).toEqual(ok());

    // Sleep 1 second to guarantee that this next export directory has a different name than the
    // previously created one
    await sleep(1000);
    expect(
      await apiClient.exportCastVoteRecordsToUsbDrive({
        isMinimalExport: false,
      })
    ).toEqual(ok());

    const cvrReportDirectoryPath = (
      await getCastVoteRecordExportDirectoryPaths(mockUsbDrive.usbDrive)
    )[0];
    expect(cvrReportDirectoryPath).toContain('TEST__machine_000__');

    const { castVoteRecordIterator } = (
      await readCastVoteRecordExport(cvrReportDirectoryPath)
    ).unsafeUnwrap();
    const cvrs: CVR.CVR[] = (await castVoteRecordIterator.toArray()).map(
      (castVoteRecordResult) =>
        castVoteRecordResult.unsafeUnwrap().castVoteRecord
    );
    expect(
      cvrs.map((cvr) =>
        convertCastVoteRecordVotesToTabulationVotes(cvr.CVRSnapshot[0])
      )
    ).toEqual([
      expect.objectContaining({
        mayor: ['sherlock-holmes'],
        controller: ['winston-churchill'],
      }),
    ]);
  }

  {
    // delete all batches
    const status = await request(app)
      .get('/central-scanner/scan/status')
      .set('Accept', 'application/json')
      .expect(200);
    for (const { id } of JSON.parse(status.text).batches) {
      await request(app)
        .post(`/api/deleteBatch`)
        .send({ batchId: id })
        .set('Accept', 'application/json')
        .expect(200);
    }
  }

  {
    // expect that we have no batches
    const status = await request(app)
      .get('/central-scanner/scan/status')
      .set('Accept', 'application/json')
      .expect(200);
    expect(JSON.parse(status.text).batches).toEqual([]);
  }

  // Sleep 1 second to guarantee that this next export directory has a different name than the
  // previously created one
  await sleep(1000);
  expect(
    await apiClient.exportCastVoteRecordsToUsbDrive({
      isMinimalExport: true,
    })
  ).toEqual(ok());

  const cvrReportDirectoryPaths = await getCastVoteRecordExportDirectoryPaths(
    mockUsbDrive.usbDrive
  );
  expect(cvrReportDirectoryPaths).toHaveLength(3);
  const cvrReportDirectoryPath = cvrReportDirectoryPaths[2];
  const { castVoteRecordIterator } = (
    await readCastVoteRecordExport(cvrReportDirectoryPath)
  ).unsafeUnwrap();

  // there should be no CVRs in the file.
  expect(await castVoteRecordIterator.count()).toEqual(0);

  // clean up
  await apiClient.unconfigure();
});

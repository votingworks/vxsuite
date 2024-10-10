import {
  buildMockDippedSmartCardAuth,
  DippedSmartCardAuthApi,
} from '@votingworks/auth';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { Logger, mockBaseLogger } from '@votingworks/logging';
import {
  BallotMetadata,
  BallotStyleId,
  BallotType,
  DEFAULT_SYSTEM_SETTINGS,
  PageInterpretationWithFiles,
  SheetOf,
  TEST_JURISDICTION,
} from '@votingworks/types';
import { createMockUsbDrive, MockUsbDrive } from '@votingworks/usb-drive';
import { Application } from 'express';
import * as fs from 'node:fs/promises';
import { Server } from 'node:http';
import request from 'supertest';
import { dirSync } from 'tmp';
import { v4 as uuid } from 'uuid';
import { buildMockLogger } from '../test/helpers/setup_app';
import { makeMock, makeMockScanner } from '../test/util/mocks';
import { buildCentralScannerApp } from './app';
import { Importer } from './importer';
import { createWorkspace, Workspace } from './util/workspace';

jest.mock('./importer');

const jurisdiction = TEST_JURISDICTION;

let app: Application;
let auth: DippedSmartCardAuthApi;
let importer: jest.Mocked<Importer>;
let server: Server;
let workspace: Workspace;
let logger: Logger;
let mockUsbDrive: MockUsbDrive;

beforeEach(() => {
  auth = buildMockDippedSmartCardAuth();
  workspace = createWorkspace(dirSync().name, mockBaseLogger());
  workspace.store.setElectionAndJurisdiction({
    electionData:
      electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition
        .electionData,
    jurisdiction,
    electionPackageHash: 'test-election-package-hash',
  });
  workspace.store.setTestMode(false);
  workspace.store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
  logger = buildMockLogger(auth, workspace);
  importer = makeMock(Importer);
  mockUsbDrive = createMockUsbDrive();

  app = buildCentralScannerApp({
    auth,
    usbDrive: mockUsbDrive.usbDrive,
    allowedExportPatterns: ['/tmp/**'],
    scanner: makeMockScanner(),
    importer,
    workspace,
    logger,
  });
});

afterEach(async () => {
  await fs.rm(workspace.path, {
    force: true,
    recursive: true,
  });
  server?.close();
});

const frontImagePath =
  electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedFront.asFilePath();
const backImagePath =
  electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedBack.asFilePath();
const sheet: SheetOf<PageInterpretationWithFiles> = (() => {
  const metadata: BallotMetadata = {
    ballotHash:
      electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition
        .ballotHash,
    ballotType: BallotType.Precinct,
    ballotStyleId: '12' as BallotStyleId,
    precinctId: '23',
    isTestMode: false,
  };
  return [
    {
      imagePath: frontImagePath,
      interpretation: {
        type: 'InterpretedHmpbPage',
        metadata: {
          ...metadata,
          pageNumber: 1,
        },
        votes: {},
        markInfo: {
          ballotSize: { width: 0, height: 0 },
          marks: [],
        },
        adjudicationInfo: {
          requiresAdjudication: false,
          enabledReasons: [],
          enabledReasonInfos: [],
          ignoredReasonInfos: [],
        },
        layout: {
          pageSize: { width: 0, height: 0 },
          metadata: {
            ...metadata,
            pageNumber: 1,
          },
          contests: [],
        },
      },
    },
    {
      imagePath: backImagePath,
      interpretation: {
        type: 'InterpretedHmpbPage',
        metadata: {
          ...metadata,
          pageNumber: 2,
        },
        votes: {},
        markInfo: {
          ballotSize: { width: 0, height: 0 },
          marks: [],
        },
        adjudicationInfo: {
          requiresAdjudication: false,
          enabledReasons: [],
          enabledReasonInfos: [],
          ignoredReasonInfos: [],
        },
        layout: {
          pageSize: { width: 0, height: 0 },
          metadata: {
            ...metadata,
            pageNumber: 2,
          },
          contests: [],
        },
      },
    },
  ];
})();

test('GET /central-scan/hmpb/ballot/:ballotId/:side/image', async () => {
  const batchId = workspace.store.addBatch();
  const sheetId = workspace.store.addSheet(uuid(), batchId, sheet);
  workspace.store.finishBatch({ batchId });

  await request(app)
    .get(`/central-scanner/scan/hmpb/ballot/${sheetId}/front/image`)
    .expect(200, await fs.readFile(frontImagePath));

  await request(app)
    .get(`/central-scanner/scan/hmpb/ballot/${sheetId}/back/image`)
    .expect(200, await fs.readFile(backImagePath));
});

test('GET /central-scan/hmpb/ballot/:sheetId/image 404', async () => {
  await request(app)
    .get(`/central-scanner/scan/hmpb/ballot/111/front/image`)
    .expect(404);
});

test('GET /', async () => {
  await request(app).get('/').expect(404);
});

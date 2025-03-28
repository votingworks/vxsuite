import {
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  Mocked,
  test,
  vi,
} from 'vitest';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import {
  AdjudicationReason,
  BallotMetadata,
  BallotStyleId,
  BallotType,
  DEFAULT_SYSTEM_SETTINGS,
  InterpretedHmpbPage,
  PageInterpretationWithFiles,
  SheetOf,
  TEST_JURISDICTION,
} from '@votingworks/types';
import { Scan } from '@votingworks/api';
import { Application } from 'express';
import * as fs from 'node:fs/promises';
import request from 'supertest';
import { dirSync } from 'tmp';
import { v4 as uuid } from 'uuid';
import { typedAs } from '@votingworks/basics';
import {
  buildMockDippedSmartCardAuth,
  DippedSmartCardAuthApi,
} from '@votingworks/auth';
import { Server } from 'node:http';
import { Logger, mockBaseLogger } from '@votingworks/logging';
import { MockUsbDrive, createMockUsbDrive } from '@votingworks/usb-drive';
import { makeMock, makeMockScanner } from '../test/util/mocks';
import { Importer } from './importer';
import { createWorkspace, Workspace } from './util/workspace';
import { buildCentralScannerApp } from './app';
import { buildMockLogger } from '../test/helpers/setup_app';

vi.mock(import('./importer.js'));

const jurisdiction = TEST_JURISDICTION;

let app: Application;
let auth: DippedSmartCardAuthApi;
let importer: Mocked<Importer>;
let server: Server;
let workspace: Workspace;
let logger: Logger;
let mockUsbDrive: MockUsbDrive;

beforeEach(() => {
  auth = buildMockDippedSmartCardAuth(vi.fn);
  workspace = createWorkspace(dirSync().name, mockBaseLogger({ fn: vi.fn }));
  workspace.store.setElectionAndJurisdiction({
    electionData:
      electionGridLayoutNewHampshireTestBallotFixtures.electionJson.asText(),
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

let frontImagePath: string;
let backImagePath: string;
let sheet: SheetOf<PageInterpretationWithFiles>;

beforeAll(() => {
  frontImagePath =
    electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedFront.asFilePath();
  backImagePath =
    electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedBack.asFilePath();
  sheet = (() => {
    const metadata: BallotMetadata = {
      ballotHash:
        electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition()
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
});

test('GET /scan/hmpb/ballot/:ballotId/:side/image', async () => {
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

test('GET /scan/hmpb/ballot/:sheetId/image 404', async () => {
  await request(app)
    .get(`/central-scanner/scan/hmpb/ballot/111/front/image`)
    .expect(404);
});

test('GET /', async () => {
  await request(app).get('/').expect(404);
});

test('get next sheet', async () => {
  vi.spyOn(workspace.store, 'getNextAdjudicationSheet').mockReturnValueOnce({
    id: 'mock-review-sheet',
    front: {
      image: { url: '/url/front' },
      interpretation: { type: 'BlankPage' },
    },
    back: {
      image: { url: '/url/back' },
      interpretation: { type: 'BlankPage' },
    },
  });

  await request(app)
    .get(`/central-scanner/scan/hmpb/review/next-sheet`)
    .expect(
      200,
      typedAs<Scan.GetNextReviewSheetResponse>({
        interpreted: {
          id: 'mock-review-sheet',
          front: {
            image: { url: '/url/front' },
            interpretation: { type: 'BlankPage' },
          },
          back: {
            image: { url: '/url/back' },
            interpretation: { type: 'BlankPage' },
          },
        },
        layouts: {},
        definitions: {},
      })
    );
});

test('get next sheet layouts', async () => {
  const metadata: BallotMetadata = {
    ballotHash:
      electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition()
        .ballotHash,
    ballotType: BallotType.Precinct,
    ballotStyleId: 'card-number-3' as BallotStyleId,
    precinctId: 'town-id-00701-precinct-id-default',
    isTestMode: false,
  };
  const frontInterpretation: InterpretedHmpbPage = {
    type: 'InterpretedHmpbPage',
    metadata: {
      ...metadata,
      pageNumber: 1,
    },
    markInfo: {
      ballotSize: { width: 1, height: 1 },
      marks: [],
    },
    adjudicationInfo: {
      requiresAdjudication: true,
      enabledReasons: [AdjudicationReason.Overvote],
      enabledReasonInfos: [
        {
          type: AdjudicationReason.Overvote,
          contestId: 'contest-id',
          expected: 1,
          optionIds: ['option-id', 'option-id-2'],
        },
      ],
      ignoredReasonInfos: [],
    },
    votes: {},
    layout: {
      pageSize: { width: 1, height: 1 },
      metadata: {
        ...metadata,
        pageNumber: 1,
      },
      contests: [],
    },
  };
  const backInterpretation: InterpretedHmpbPage = {
    ...frontInterpretation,
    metadata: {
      ...frontInterpretation.metadata,
      pageNumber: 2,
    },
  };
  vi.spyOn(workspace.store, 'getNextAdjudicationSheet').mockReturnValueOnce({
    id: 'mock-review-sheet',
    front: {
      image: { url: '/url/front' },
      interpretation: frontInterpretation,
    },
    back: {
      image: { url: '/url/back' },
      interpretation: backInterpretation,
    },
  });

  const response = await request(app)
    .get(`/central-scanner/scan/hmpb/review/next-sheet`)
    .expect(200);

  expect(response.body).toEqual<Scan.GetNextReviewSheetResponse>({
    interpreted: {
      id: 'mock-review-sheet',
      front: {
        image: { url: '/url/front' },
        interpretation: frontInterpretation,
      },
      back: {
        image: { url: '/url/back' },
        interpretation: backInterpretation,
      },
    },
    layouts: {
      front: frontInterpretation.layout,
      back: backInterpretation.layout,
    },
    definitions: {
      front: { contestIds: expect.any(Array) },
      back: { contestIds: expect.any(Array) },
    },
  });
});

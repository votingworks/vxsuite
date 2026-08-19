import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { HP_4001_PRINTER_CONFIG, renderToPdf } from '@votingworks/printing';
import { assert, assertDefined, err, ok } from '@votingworks/basics';
import {
  createImageData,
  crop,
  loadImageData,
  toDataUrl,
} from '@votingworks/image-utils';
import { BallotPageLayout, BallotType } from '@votingworks/types';
import { LogEventId } from '@votingworks/logging';
import { Buffer } from 'node:buffer';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  attachUsbDrive,
  buildTestEnvironment,
  configureMachine,
  devsdb,
  mockElectionManagerAuth,
} from '../test/app.js';
import { mockFileName } from '../test/csv.js';
import {
  MockCastVoteRecordFile,
  addMockCvrFileToStore,
} from '../test/mock_cvr_file.js';
import { Store } from './store.js';
import { buildAdminContestWriteIns } from './reports/write_in_image_report.js';
import { generateReportPath } from './util/filenames.js';

vi.setConfig({ testTimeout: 30_000 });

vi.mock(import('./util/get_current_time.js'), async (importActual) => ({
  ...(await importActual()),
  getCurrentTime: () => new Date('2021-01-01T00:00:00.000').getTime(),
}));

vi.mock(import('@votingworks/types'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    formatElectionHashes: vi.fn().mockReturnValue('1111111-0000000'),
  };
});

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

vi.mock(import('@votingworks/image-utils'), async (importActual) => ({
  ...(await importActual()),
  loadImageData: vi.fn(),
  crop: vi.fn(),
  toDataUrl: vi.fn(),
}));

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

const electionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();
const MAYOR_CONTEST_ID = 'mayor';
const SHERLOCK_ID = 'sherlock-holmes';
const WRITE_IN_OPTION_ID = 'write-in-0';
const BOARD_CONTEST_ID = 'board-of-alderman';
const HELEN_ID = 'helen-keller';
const STEVE_ID = 'steve-jobs';

const BASE_CVR: Omit<MockCastVoteRecordFile[number], 'card' | 'votes'> = {
  ballotStyleGroupId: '1-2',
  batchId: 'batch-1',
  scannerId: 'scanner-1',
  precinctId: '21',
  votingMethod: 'precinct',
};

async function setup() {
  const { apiClient, auth, workspace } = buildTestEnvironment();
  const electionId = await configureMachine(
    apiClient,
    auth,
    electionDefinition
  );
  return { store: workspace.store, electionId };
}

function addHmpbWriteInCvr(
  store: Store,
  electionId: string
): { cvrId: string; writeInId: string } {
  const [cvrId] = addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile: [
      { ...BASE_CVR, card: { type: 'hmpb', sheetNumber: 1 }, votes: {} },
    ],
    store,
    pollingPlaceId: 'polling-place-1',
  });
  assert(cvrId !== undefined);
  const { electionDefinition: ed } = assertDefined(
    store.getElection(electionId)
  );
  store.addBallotImage({
    cvrId,
    electionDefinitionId: ed.election.id,
    imageData: Buffer.from([]),
    side: 'front',
  });
  store.addBallotImage({
    cvrId,
    electionDefinitionId: ed.election.id,
    imageData: Buffer.from([]),
    side: 'back',
  });
  const writeInId = store.addWriteIn({
    electionId,
    castVoteRecordId: cvrId,
    contestId: MAYOR_CONTEST_ID,
    optionId: WRITE_IN_OPTION_ID,
  });
  return { cvrId, writeInId };
}

function addBmdTextWriteIn(
  store: Store,
  electionId: string,
  machineMarkedText: string
): { cvrId: string; writeInId: string } {
  const [cvrId] = addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile: [{ ...BASE_CVR, card: { type: 'bmd' }, votes: {} }],
    store,
    pollingPlaceId: 'polling-place-1',
  });
  assert(cvrId !== undefined);
  const { electionDefinition: ed } = assertDefined(
    store.getElection(electionId)
  );
  store.addBallotImage({
    cvrId,
    electionDefinitionId: ed.election.id,
    imageData: Buffer.from([]),
    side: 'front',
  });
  store.addBallotImage({
    cvrId,
    electionDefinitionId: ed.election.id,
    imageData: Buffer.from([]),
    side: 'back',
  });
  const writeInId = store.addWriteIn({
    electionId,
    castVoteRecordId: cvrId,
    contestId: MAYOR_CONTEST_ID,
    optionId: WRITE_IN_OPTION_ID,
    machineMarkedText,
  });
  return { cvrId, writeInId };
}

async function getMayorResult(store: Store, electionId: string) {
  const result = await buildAdminContestWriteIns(
    store,
    electionId,
    MAYOR_CONTEST_ID
  );
  return assertDefined(result.get(MAYOR_CONTEST_ID));
}

test('BMD text write-in adjudicated to write-in candidate', async () => {
  const { store, electionId } = await setup();
  const { writeInId } = addBmdTextWriteIn(store, electionId, 'Jane Doe');
  const { id: candidateId } = store.addWriteInCandidate({
    electionId,
    contestId: MAYOR_CONTEST_ID,
    name: 'Jane Doe',
  });
  store.setWriteInRecordUnofficialCandidate({
    type: 'write-in-candidate',
    writeInId,
    candidateId,
  });

  const { candidateGroups, unadjudicatedWriteIns } = await getMayorResult(
    store,
    electionId
  );

  expect(candidateGroups).toHaveLength(1);
  expect(candidateGroups[0]).toMatchObject({
    groupLabel: 'Jane Doe',
    isQualified: true,
    writeIns: [{ type: 'text', text: 'Jane Doe' }],
  });
  expect(unadjudicatedWriteIns).toEqual([]);
  expect(loadImageData).not.toHaveBeenCalled();
});

test('HMPB write-in adjudicated to official candidate', async () => {
  const { store, electionId } = await setup();
  const { writeInId } = addHmpbWriteInCvr(store, electionId);
  store.setWriteInRecordOfficialCandidate({
    type: 'official-candidate',
    writeInId,
    candidateId: SHERLOCK_ID,
  });

  const { candidateGroups, unadjudicatedWriteIns } = await getMayorResult(
    store,
    electionId
  );

  expect(candidateGroups).toHaveLength(1);
  expect(candidateGroups[0]).toMatchObject({
    groupLabel: 'Sherlock Holmes',
    isQualified: true,
  });
  expect(unadjudicatedWriteIns).toEqual([]);
});

test('pending BMD write-in goes to unadjudicatedWriteIns', async () => {
  const { store, electionId } = await setup();
  addBmdTextWriteIn(store, electionId, 'Pending Name');

  const { candidateGroups, unadjudicatedWriteIns } = await getMayorResult(
    store,
    electionId
  );

  expect(candidateGroups).toHaveLength(0);
  expect(unadjudicatedWriteIns).toEqual([
    { type: 'text', text: 'Pending Name' },
  ]);
});

test('pending HMPB write-in with no image entry not in unadjudicatedWriteIns', async () => {
  const { store, electionId } = await setup();
  addHmpbWriteInCvr(store, electionId);

  const { candidateGroups, unadjudicatedWriteIns } = await getMayorResult(
    store,
    electionId
  );

  expect(candidateGroups).toHaveLength(0);
  expect(unadjudicatedWriteIns).toEqual([]);
});

test('adjudicated invalid write-in creates invalid group', async () => {
  const { store, electionId } = await setup();
  const { writeInId } = addBmdTextWriteIn(store, electionId, 'Bad Name');
  store.setWriteInRecordInvalid({ type: 'invalid', writeInId });

  const { candidateGroups, unadjudicatedWriteIns } = await getMayorResult(
    store,
    electionId
  );

  expect(candidateGroups).toHaveLength(1);
  expect(candidateGroups[0]).toMatchObject({
    groupLabel: 'Invalid',
    isQualified: false,
  });
  expect(unadjudicatedWriteIns).toEqual([]);
});

test('HMPB invalid write-in with no image entry not in invalid group', async () => {
  const { store, electionId } = await setup();
  const { writeInId } = addHmpbWriteInCvr(store, electionId);
  store.setWriteInRecordInvalid({ type: 'invalid', writeInId });

  const { candidateGroups } = await getMayorResult(store, electionId);

  expect(candidateGroups).toHaveLength(0);
});

function makeLayoutForContest(
  contestId: string,
  optionId = WRITE_IN_OPTION_ID
): BallotPageLayout {
  return {
    pageSize: { width: 600, height: 900 },
    metadata: {
      ballotHash: 'abc123def456abc1',
      ballotStyleId: '1-2',
      precinctId: '21',
      pageNumber: 1,
      isTestMode: true,
      ballotType: BallotType.Precinct,
    },
    contests: [
      {
        contestId,
        bounds: { x: 10, y: 100, width: 400, height: 200 },
        corners: [
          { x: 10, y: 100 },
          { x: 410, y: 100 },
          { x: 10, y: 300 },
          { x: 410, y: 300 },
        ],
        options: [
          {
            definition: {
              type: 'candidate',
              id: optionId,
              contestId,
              isWriteIn: true,
              writeInIndex: 0,
            },
            bounds: { x: 10, y: 230, width: 400, height: 60 },
            target: {
              bounds: { x: 10, y: 240, width: 20, height: 20 },
              inner: { x: 12, y: 242, width: 16, height: 16 },
            },
          },
        ],
      },
    ],
  };
}

function addHmpbCvrWithLayouts(
  store: Store,
  electionId: string,
  frontLayout: BallotPageLayout,
  backLayout?: BallotPageLayout
): { writeInId: string } {
  const [cvrId] = addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile: [
      { ...BASE_CVR, card: { type: 'hmpb', sheetNumber: 1 }, votes: {} },
    ],
    store,
    pollingPlaceId: 'polling-place-1',
  });
  assert(cvrId !== undefined);
  const { electionDefinition: ed } = assertDefined(
    store.getElection(electionId)
  );
  store.addBallotImage({
    cvrId,
    electionDefinitionId: ed.election.id,
    imageData: Buffer.from([]),
    pageLayout: frontLayout,
    side: 'front',
  });
  store.addBallotImage({
    cvrId,
    electionDefinitionId: ed.election.id,
    imageData: Buffer.from([]),
    pageLayout: backLayout,
    side: 'back',
  });
  const writeInId = store.addWriteIn({
    electionId,
    castVoteRecordId: cvrId,
    contestId: MAYOR_CONTEST_ID,
    optionId: WRITE_IN_OPTION_ID,
  });
  return { writeInId };
}

test('failed image load causes write-in entry to be skipped', async () => {
  const { store, electionId } = await setup();
  const { writeInId } = addHmpbCvrWithLayouts(
    store,
    electionId,
    makeLayoutForContest(MAYOR_CONTEST_ID)
  );
  store.setWriteInRecordOfficialCandidate({
    type: 'official-candidate',
    writeInId,
    candidateId: SHERLOCK_ID,
  });

  vi.mocked(loadImageData).mockResolvedValueOnce(
    err({ type: 'invalid-image-file' as const, message: 'load failed' })
  );

  const { candidateGroups } = await getMayorResult(store, electionId);

  expect(candidateGroups).toHaveLength(1);
  expect(candidateGroups[0]!.writeIns).toHaveLength(0);
});

test('layout missing write-in option skips entry', async () => {
  const { store, electionId } = await setup();
  const { writeInId } = addHmpbCvrWithLayouts(
    store,
    electionId,
    makeLayoutForContest(MAYOR_CONTEST_ID, 'write-in-1')
  );
  store.setWriteInRecordOfficialCandidate({
    type: 'official-candidate',
    writeInId,
    candidateId: SHERLOCK_ID,
  });

  const { candidateGroups } = await getMayorResult(store, electionId);

  expect(candidateGroups[0]!.writeIns).toHaveLength(0);
});

test('successful image crop produces image entry', async () => {
  const { store, electionId } = await setup();
  const { writeInId } = addHmpbCvrWithLayouts(
    store,
    electionId,
    makeLayoutForContest(BOARD_CONTEST_ID),
    makeLayoutForContest(MAYOR_CONTEST_ID)
  );
  store.setWriteInRecordOfficialCandidate({
    type: 'official-candidate',
    writeInId,
    candidateId: SHERLOCK_ID,
  });

  const mockImage = createImageData(new Uint8ClampedArray(4), 1, 1);
  vi.mocked(loadImageData).mockResolvedValueOnce(ok(mockImage));
  vi.mocked(crop).mockReturnValueOnce(mockImage);
  vi.mocked(toDataUrl).mockReturnValueOnce('data:image/png;base64,test');

  const { candidateGroups } = await getMayorResult(store, electionId);

  expect(candidateGroups[0]!.writeIns).toEqual([
    { type: 'image', dataUrl: 'data:image/png;base64,test' },
  ]);
});

test('candidate groups sorted alphabetically regardless of type', async () => {
  const { store, electionId } = await setup();

  const { writeInId: zaraWriteInId } = addBmdTextWriteIn(
    store,
    electionId,
    'Zara Z'
  );
  const { id: zaraCandidateId } = store.addWriteInCandidate({
    electionId,
    contestId: MAYOR_CONTEST_ID,
    name: 'Zara Z',
  });
  store.setWriteInRecordUnofficialCandidate({
    type: 'write-in-candidate',
    writeInId: zaraWriteInId,
    candidateId: zaraCandidateId,
  });

  const { writeInId: sherlockWriteInId } = addHmpbWriteInCvr(store, electionId);
  store.setWriteInRecordOfficialCandidate({
    type: 'official-candidate',
    writeInId: sherlockWriteInId,
    candidateId: SHERLOCK_ID,
  });

  const { candidateGroups } = await getMayorResult(store, electionId);

  expect(candidateGroups.map((g) => g.groupLabel)).toEqual([
    'Sherlock Holmes',
    'Zara Z',
  ]);
});

test('invalid group is last in candidateGroups', async () => {
  const { store, electionId } = await setup();

  const { writeInId: invalidWriteInId } = addBmdTextWriteIn(
    store,
    electionId,
    'Not Valid'
  );
  store.setWriteInRecordInvalid({
    type: 'invalid',
    writeInId: invalidWriteInId,
  });

  const { writeInId: qualifiedWriteInId } = addBmdTextWriteIn(
    store,
    electionId,
    'Jane'
  );
  const { id: candidateId } = store.addWriteInCandidate({
    electionId,
    contestId: MAYOR_CONTEST_ID,
    name: 'Jane',
  });
  store.setWriteInRecordUnofficialCandidate({
    type: 'write-in-candidate',
    writeInId: qualifiedWriteInId,
    candidateId,
  });

  const { candidateGroups } = await getMayorResult(store, electionId);

  expect(candidateGroups.map((g) => g.isQualified)).toEqual([true, false]);
});

test('no write-ins results in empty candidateGroups and unadjudicatedWriteIns', async () => {
  const { store, electionId } = await setup();

  const { candidateGroups, unadjudicatedWriteIns } = await getMayorResult(
    store,
    electionId
  );

  expect(candidateGroups).toEqual([]);
  expect(unadjudicatedWriteIns).toEqual([]);
});

test('CVR image cache: getBallotImagesAndLayouts called once per CVR', async () => {
  const { store, electionId } = await setup();

  const [cvrId] = addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile: [
      { ...BASE_CVR, card: { type: 'hmpb', sheetNumber: 1 }, votes: {} },
    ],
    store,
    pollingPlaceId: 'polling-place-1',
  });
  assert(cvrId !== undefined);
  const { electionDefinition: ed } = assertDefined(
    store.getElection(electionId)
  );
  store.addBallotImage({
    cvrId,
    electionDefinitionId: ed.election.id,
    imageData: Buffer.from([]),
    side: 'front',
  });
  store.addBallotImage({
    cvrId,
    electionDefinitionId: ed.election.id,
    imageData: Buffer.from([]),
    side: 'back',
  });
  const firstWriteInId = store.addWriteIn({
    electionId,
    castVoteRecordId: cvrId,
    contestId: BOARD_CONTEST_ID,
    optionId: 'write-in-0',
  });
  const secondWriteInId = store.addWriteIn({
    electionId,
    castVoteRecordId: cvrId,
    contestId: BOARD_CONTEST_ID,
    optionId: 'write-in-1',
  });
  store.setWriteInRecordOfficialCandidate({
    type: 'official-candidate',
    writeInId: firstWriteInId,
    candidateId: HELEN_ID,
  });
  store.setWriteInRecordOfficialCandidate({
    type: 'official-candidate',
    writeInId: secondWriteInId,
    candidateId: STEVE_ID,
  });

  const spy = vi.spyOn(store, 'getBallotImagesAndLayouts');
  await buildAdminContestWriteIns(store, electionId, BOARD_CONTEST_ID);
  expect(spy).toHaveBeenCalledTimes(1);
});

test('two write-ins for same candidate reuse existing group', async () => {
  const { store, electionId } = await setup();

  const { writeInId: writeInId1 } = addBmdTextWriteIn(
    store,
    electionId,
    'Sherlock Holmes'
  );
  const { writeInId: writeInId2 } = addBmdTextWriteIn(
    store,
    electionId,
    'Sherlock Holmes'
  );
  store.setWriteInRecordOfficialCandidate({
    type: 'official-candidate',
    writeInId: writeInId1,
    candidateId: SHERLOCK_ID,
  });
  store.setWriteInRecordOfficialCandidate({
    type: 'official-candidate',
    writeInId: writeInId2,
    candidateId: SHERLOCK_ID,
  });

  const { candidateGroups } = await getMayorResult(store, electionId);

  expect(candidateGroups).toHaveLength(1);
  expect(candidateGroups[0]!.groupLabel).toEqual('Sherlock Holmes');
  expect(candidateGroups[0]!.writeIns).toHaveLength(2);
});

test('write-in image report: preview, print, and export', async () => {
  const { apiClient, auth, mockPrinterHandler, usbPlatform } =
    buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  mockPrinterHandler.connectPrinter(HP_4001_PRINTER_CONFIG);
  await attachUsbDrive(apiClient, usbPlatform);

  const preview = await apiClient.getWriteInImageReportPreview({
    contestId: MAYOR_CONTEST_ID,
  });
  expect(preview.warning).toBeUndefined();
  expect(preview.pdf).toBeDefined();

  await apiClient.printWriteInImageReport({ contestId: MAYOR_CONTEST_ID });
  expect(mockPrinterHandler.getLastPrintPath()).toBeDefined();

  const filename = mockFileName('pdf');
  const exportResult = await apiClient.exportWriteInImageReportPdf({
    contestId: MAYOR_CONTEST_ID,
    filename,
  });
  exportResult.assertOk('export should have succeeded');
});

test('write-in image report logging', async () => {
  const { apiClient, auth, logger, mockPrinterHandler, usbPlatform } =
    buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  mockPrinterHandler.connectPrinter(HP_4001_PRINTER_CONFIG);
  await attachUsbDrive(apiClient, usbPlatform);

  const validFilename = mockFileName('pdf');
  (
    await apiClient.exportWriteInImageReportPdf({
      contestId: MAYOR_CONTEST_ID,
      filename: validFilename,
    })
  ).assertOk('export should have succeeded');
  const reportPath = generateReportPath(electionDefinition, validFilename);
  expect(logger.log).lastCalledWith(LogEventId.FileSaved, 'election_manager', {
    disposition: 'success',
    message: `Saved write-in image report PDF file to ${reportPath} on the USB drive.`,
    path: reportPath,
  });

  usbPlatform.removeDrive(devsdb);
  const invalidFilename = mockFileName('pdf');
  (
    await apiClient.exportWriteInImageReportPdf({
      contestId: MAYOR_CONTEST_ID,
      filename: invalidFilename,
    })
  ).assertErr('export should have failed');
  const invalidReportPath = generateReportPath(
    electionDefinition,
    invalidFilename
  );
  expect(logger.log).lastCalledWith(LogEventId.FileSaved, 'election_manager', {
    disposition: 'failure',
    message: `Failed to save write-in image report PDF file to ${invalidReportPath} on the USB drive.`,
    path: invalidReportPath,
  });

  await apiClient.printWriteInImageReport({ contestId: MAYOR_CONTEST_ID });
  expect(logger.log).lastCalledWith(
    LogEventId.ElectionReportPrinted,
    'election_manager',
    {
      message: `User printed the write-in image report.`,
      disposition: 'success',
    }
  );

  mockPrinterHandler.disconnectPrinter();
  await apiClient.printWriteInImageReport({ contestId: MAYOR_CONTEST_ID });
  expect(logger.log).lastCalledWith(
    LogEventId.ElectionReportPrinted,
    'election_manager',
    {
      message: `Error in attempting to print the write-in image report: cannot print without printer connected`,
      disposition: 'failure',
    }
  );

  mockPrinterHandler.connectPrinter(HP_4001_PRINTER_CONFIG);
  await apiClient.getWriteInImageReportPreview({ contestId: MAYOR_CONTEST_ID });
  expect(logger.log).lastCalledWith(
    LogEventId.ElectionReportPreviewed,
    'election_manager',
    {
      message: `User previewed the write-in image report.`,
      disposition: 'success',
    }
  );
});

test('write-in image report preview: content-too-large warning', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  vi.mocked(renderToPdf).mockResolvedValueOnce(err('content-too-large'));
  expect(
    await apiClient.getWriteInImageReportPreview({
      contestId: MAYOR_CONTEST_ID,
    })
  ).toEqual({
    pdf: undefined,
    warning: { type: 'content-too-large' },
  });
});

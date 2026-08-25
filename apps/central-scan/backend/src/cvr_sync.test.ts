import {
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  Mock,
  test,
  vi,
} from 'vitest';
import { randomUUID as uuid } from 'node:crypto';
import { err, ok } from '@votingworks/basics';
import * as grout from '@votingworks/grout';
import { NETWORK_POLLING_INTERVAL_MS } from '@votingworks/networking';
import { getEntries, openZip } from '@votingworks/utils';
import { LogEventId, mockBaseLogger } from '@votingworks/logging';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import {
  BallotMetadata,
  BallotType,
  DEFAULT_SYSTEM_SETTINGS,
  DEV_MACHINE_ID,
  PageInterpretationWithFiles,
  SheetOf,
  TEST_JURISDICTION,
} from '@votingworks/types';
import * as fsSync from 'node:fs';
import path from 'node:path';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { generateHmpbFixture } from '../test/helpers/ballots.js';
import { startCvrSync } from './cvr_sync.js';
import { Store } from './store.js';
import { NetworkConnectionInfo } from './types.js';

vi.setConfig({
  testTimeout: 60_000,
});

vi.mock('@votingworks/grout');

const buildOverride = vi.hoisted((): { result: unknown } => ({
  result: undefined,
}));
vi.mock(import('@votingworks/backend'), async (importActual) => {
  const actual = await importActual();
  const mocked: typeof actual = {
    ...actual,
    buildCastVoteRecordFiles: (...args) =>
      buildOverride.result
        ? Promise.resolve(
            buildOverride.result as Awaited<
              ReturnType<typeof actual.buildCastVoteRecordFiles>
            >
          )
        : actual.buildCastVoteRecordFiles(...args),
  };
  return mocked;
});

const HOST_ADDRESS = 'http://192.168.1.10:3002';
const POLLING_PLACE_ID = '23';

// A type literal (not an interface) so it's assignable to grout's
// index-signature-based Client type.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type MockHostApiClient = {
  startCvrTransfer: Mock;
  finishCvrTransfer: Mock;
};

let sheet: SheetOf<PageInterpretationWithFiles>;

beforeAll(async () => {
  const hmpbFixture = await generateHmpbFixture();
  const [frontImagePath, backImagePath] = hmpbFixture.sheet;
  const metadata: BallotMetadata = {
    ballotHash: vxFamousNamesFixtures.electionDefinition.ballotHash,
    ballotType: BallotType.Precinct,
    ballotStyleId: '12',
    precinctId: '23',
    isTestMode: false,
  };
  function interpretationForPage(
    imagePath: string,
    pageNumber: number
  ): PageInterpretationWithFiles {
    return {
      imagePath,
      interpretation: {
        type: 'InterpretedHmpbPage',
        metadata: { ...metadata, pageNumber },
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
          metadata: { ...metadata, pageNumber },
          contests: [],
        },
      },
    };
  }
  sheet = [
    interpretationForPage(frontImagePath, 1),
    interpretationForPage(backImagePath, 2),
  ];
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
});

afterEach(() => {
  buildOverride.result = undefined;
  vi.useRealTimers();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

function buildStore(): Store {
  const store = Store.memoryStore();
  store.setElectionAndJurisdiction({
    electionData: vxFamousNamesFixtures.electionDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
    electionPackageHash: 'test-election-package-hash',
  });
  store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
  store.setPollingPlaceId(POLLING_PLACE_ID);
  return store;
}

function addFinishedBatch(store: Store, sheetCount = 1): string {
  const batchId = store.addBatch();
  for (let i = 0; i < sheetCount; i += 1) {
    // Image paths are unique per sheet in the store, so give each sheet its
    // own copy of the fixture images.
    const imageDirectory = makeTemporaryDirectory();
    function copyPage(
      page: PageInterpretationWithFiles,
      side: number
    ): PageInterpretationWithFiles {
      const imagePath = path.join(imageDirectory, `page-${side}.png`);
      fsSync.copyFileSync(page.imagePath, imagePath);
      return { ...page, imagePath };
    }
    const sheetCopy: SheetOf<PageInterpretationWithFiles> = [
      copyPage(sheet[0], 0),
      copyPage(sheet[1], 1),
    ];
    store.addSheet(
      vxFamousNamesFixtures.electionDefinition.election,
      uuid(),
      batchId,
      sheetCopy
    );
  }
  store.finishBatch({ batchId });
  return batchId;
}

function setRegistered(store: Store): void {
  const connection: NetworkConnectionInfo = {
    status: 'online-host-detected',
    hostMachineId: '0002',
    hostAddress: HOST_ADDRESS,
  };
  store.setNetworkConnectionInfo(connection);
}

function createMockHostApiClient(): MockHostApiClient {
  const mockClient: MockHostApiClient = {
    startCvrTransfer: vi.fn().mockResolvedValue(ok({ alreadyComplete: false })),
    finishCvrTransfer: vi.fn().mockResolvedValue(ok({ cvrCount: 1 })),
  };
  vi.mocked(grout.createClient).mockReturnValue(mockClient);
  return mockClient;
}

function mockUploadResponses(status = 200): Mock {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function waitForFailure(
  logger: ReturnType<typeof mockBaseLogger>,
  step: string
): Promise<void> {
  // The send does real file I/O, which fake timers don't wait for
  await vi.waitFor(
    () =>
      expect(logger.log).toHaveBeenCalledWith(
        LogEventId.CentralScanNetworkStatus,
        'system',
        expect.objectContaining({ disposition: 'failure', step })
      ),
    { timeout: 30_000 }
  );
}

async function advancePollingInterval(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(NETWORK_POLLING_INTERVAL_MS);
}

test('does nothing until the scanner is registered with a host', async () => {
  const store = buildStore();
  addFinishedBatch(store);
  const mockClient = createMockHostApiClient();
  const fetchMock = mockUploadResponses();

  startCvrSync({ logger: mockBaseLogger({ fn: vi.fn }), store });
  await advancePollingInterval();

  expect(mockClient.startCvrTransfer).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(store.getNextBatchToSendToAdmin()).toBeDefined();
});

test('sends a completed batch and marks it sent', async () => {
  const store = buildStore();
  const batchId = addFinishedBatch(store, 2);
  setRegistered(store);
  const mockClient = createMockHostApiClient();
  mockClient.finishCvrTransfer.mockResolvedValue(ok({ cvrCount: 2 }));
  const fetchMock = mockUploadResponses();
  const logger = mockBaseLogger({ fn: vi.fn });

  startCvrSync({ logger, store });
  await advancePollingInterval();
  // The send does real file I/O, which fake timers don't wait for
  await vi.waitFor(
    () => expect(store.getNextBatchToSendToAdmin()).toBeUndefined(),
    { timeout: 30_000 }
  );

  expect(mockClient.startCvrTransfer).toHaveBeenCalledWith({
    machineId: DEV_MACHINE_ID,
    codeVersion: 'dev',
    ballotHash: vxFamousNamesFixtures.electionDefinition.ballotHash,
    batchId,
    label: expect.any(String),
    pollingPlaceId: POLLING_PLACE_ID,
    sheetCount: 2,
    startedAt: expect.any(String),
    isTestMode: true,
  });

  // One upload per sheet, each a zip containing the CVR file set
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toContain(
    `${HOST_ADDRESS}/api/cvr-transfer/${DEV_MACHINE_ID}/${batchId}/`
  );
  expect(options.method).toEqual('POST');
  const zip = await openZip(options.body as Uint8Array);
  expect(getEntries(zip).map((entry) => entry.name)).toEqual(
    expect.arrayContaining(['cast-vote-record-report.json'])
  );

  expect(mockClient.finishCvrTransfer).toHaveBeenCalledWith({
    machineId: DEV_MACHINE_ID,
    batchId,
  });
});

test('sends batches oldest first, one per pass', async () => {
  const store = buildStore();
  const olderBatchId = addFinishedBatch(store);
  const newerBatchId = addFinishedBatch(store);
  setRegistered(store);
  const mockClient = createMockHostApiClient();
  mockUploadResponses();

  startCvrSync({ logger: mockBaseLogger({ fn: vi.fn }), store });
  await advancePollingInterval();
  await vi.waitFor(
    () => expect(store.getNextBatchToSendToAdmin()?.id).toEqual(newerBatchId),
    { timeout: 30_000 }
  );

  expect(mockClient.startCvrTransfer).toHaveBeenCalledTimes(1);
  expect(mockClient.startCvrTransfer.mock.calls[0][0].batchId).toEqual(
    olderBatchId
  );

  await advancePollingInterval();
  await vi.waitFor(
    () => expect(store.getNextBatchToSendToAdmin()).toBeUndefined(),
    { timeout: 30_000 }
  );
  expect(mockClient.startCvrTransfer).toHaveBeenCalledTimes(2);
  expect(mockClient.startCvrTransfer.mock.calls[1][0].batchId).toEqual(
    newerBatchId
  );
});

test('marks a batch sent without uploading when the host already has it', async () => {
  const store = buildStore();
  addFinishedBatch(store);
  setRegistered(store);
  const mockClient = createMockHostApiClient();
  mockClient.startCvrTransfer.mockResolvedValue(ok({ alreadyComplete: true }));
  const fetchMock = mockUploadResponses();

  startCvrSync({ logger: mockBaseLogger({ fn: vi.fn }), store });
  await advancePollingInterval();

  expect(fetchMock).not.toHaveBeenCalled();
  expect(mockClient.finishCvrTransfer).not.toHaveBeenCalled();
  expect(store.getNextBatchToSendToAdmin()).toBeUndefined();
});

test('retries on the next pass when the host refuses the transfer', async () => {
  const store = buildStore();
  addFinishedBatch(store);
  setRegistered(store);
  const mockClient = createMockHostApiClient();
  mockClient.startCvrTransfer.mockResolvedValue(
    err({ type: 'ballot-hash-mismatch' })
  );
  mockUploadResponses();

  const logger = mockBaseLogger({ fn: vi.fn });
  startCvrSync({ logger, store });
  await advancePollingInterval();
  await waitForFailure(logger, 'start');
  expect(store.getNextBatchToSendToAdmin()).toBeDefined();

  await advancePollingInterval();
  expect(mockClient.startCvrTransfer).toHaveBeenCalledTimes(2);
});

test('retries on the next pass when an upload fails', async () => {
  const store = buildStore();
  addFinishedBatch(store);
  setRegistered(store);
  const mockClient = createMockHostApiClient();
  mockUploadResponses(400);

  const logger = mockBaseLogger({ fn: vi.fn });
  startCvrSync({ logger, store });
  await advancePollingInterval();
  await waitForFailure(logger, 'upload');

  expect(mockClient.finishCvrTransfer).not.toHaveBeenCalled();
  expect(store.getNextBatchToSendToAdmin()).toBeDefined();
});

test('retries on the next pass when the host is unreachable', async () => {
  const store = buildStore();
  addFinishedBatch(store);
  setRegistered(store);
  const mockClient = createMockHostApiClient();
  mockClient.startCvrTransfer.mockRejectedValue(new Error('ECONNREFUSED'));
  mockUploadResponses();

  const logger = mockBaseLogger({ fn: vi.fn });
  startCvrSync({ logger, store });
  await advancePollingInterval();
  await waitForFailure(logger, 'start');
  expect(store.getNextBatchToSendToAdmin()).toBeDefined();
});

test('does not mark a batch sent when finish fails', async () => {
  const store = buildStore();
  addFinishedBatch(store);
  setRegistered(store);
  const mockClient = createMockHostApiClient();
  mockClient.finishCvrTransfer.mockResolvedValue(
    err({
      type: 'sheet-count-mismatch',
      expected: 1,
      received: 0,
    })
  );
  mockUploadResponses();

  const logger = mockBaseLogger({ fn: vi.fn });
  startCvrSync({ logger, store });
  await advancePollingInterval();
  await waitForFailure(logger, 'finish');

  expect(store.getNextBatchToSendToAdmin()).toBeDefined();
});

test('does not mark a batch sent when finish is unreachable', async () => {
  const store = buildStore();
  addFinishedBatch(store);
  setRegistered(store);
  const mockClient = createMockHostApiClient();
  mockClient.finishCvrTransfer.mockRejectedValue(new Error('ECONNRESET'));
  mockUploadResponses();

  const logger = mockBaseLogger({ fn: vi.fn });
  startCvrSync({ logger, store });
  await advancePollingInterval();
  await waitForFailure(logger, 'finish');

  expect(store.getNextBatchToSendToAdmin()).toBeDefined();
});

test('retries on the next pass when an upload cannot reach the host', async () => {
  const store = buildStore();
  addFinishedBatch(store);
  setRegistered(store);
  const mockClient = createMockHostApiClient();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));

  const logger = mockBaseLogger({ fn: vi.fn });
  startCvrSync({ logger, store });
  await advancePollingInterval();
  await waitForFailure(logger, 'upload');

  expect(mockClient.finishCvrTransfer).not.toHaveBeenCalled();
  expect(store.getNextBatchToSendToAdmin()).toBeDefined();
});

test('retries on the next pass when a cast vote record cannot be built', async () => {
  const store = buildStore();
  addFinishedBatch(store);
  setRegistered(store);
  const mockClient = createMockHostApiClient();
  const fetchMock = mockUploadResponses();
  buildOverride.result = err({ type: 'missing-usb-drive' });

  const logger = mockBaseLogger({ fn: vi.fn });
  startCvrSync({ logger, store });
  await advancePollingInterval();
  await waitForFailure(logger, 'build');

  expect(fetchMock).not.toHaveBeenCalled();
  expect(mockClient.finishCvrTransfer).not.toHaveBeenCalled();
  expect(store.getNextBatchToSendToAdmin()).toBeDefined();
});

test('does nothing when registered with no batches to send', async () => {
  const store = buildStore();
  setRegistered(store);
  const mockClient = createMockHostApiClient();

  startCvrSync({ logger: mockBaseLogger({ fn: vi.fn }), store });
  await advancePollingInterval();

  expect(mockClient.startCvrTransfer).not.toHaveBeenCalled();
});

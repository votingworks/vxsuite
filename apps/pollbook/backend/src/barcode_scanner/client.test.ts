import tmp from 'tmp';
import { symlink } from 'node:fs/promises';
import {
  describe,
  test,
  beforeEach,
  afterEach,
  vi,
  MockedFunction,
  expect,
} from 'vitest';
import { PassThrough } from 'node:stream';
import * as net from 'node:net';
import {
  mockLogger,
  LogSource,
  MockLogger,
  LogEventId,
  LogDispositionStandardTypes,
  Logger,
} from '@votingworks/logging';
import path from 'node:path';
import { tryConnect } from './unix_socket';
import {
  connectToBarcodeScannerSocket,
  BarcodeScannerClient,
  UDS_CONNECTION_ATTEMPT_DELAY_MS,
  SCAN_DATA_TTL_MS,
} from './client';
import { AamvaDocument, BarcodeScannerError } from '../types';

vi.mock('./unix_socket');

let mockSocket: net.Socket;
let logger: MockLogger;

const mockedTryConnect = tryConnect as unknown as MockedFunction<
  typeof tryConnect
>;

// Sets up a mock UDS client and returns a Promise that resolves when
// listen() completes
async function setUpMockSocket(
  overrides: Partial<{
    logger: Logger;
    scannedDocument?: AamvaDocument;
    error?: BarcodeScannerError;
    connectedToDaemon: boolean;
    devicePath: string;
  }> = {}
): Promise<{
  barcodeScannerClient: BarcodeScannerClient;
  listenPromise: Promise<void>;
}> {
  const onSpy = vi.spyOn(mockSocket, 'on');

  mockedTryConnect.mockResolvedValue(mockSocket as unknown as net.Socket);

  const { scannedDocument, error, connectedToDaemon, devicePath } = overrides;

  const barcodeScannerClient = new BarcodeScannerClient(
    overrides.logger || logger,
    scannedDocument,
    error,
    connectedToDaemon,
    devicePath
  );
  expect(mockedTryConnect).toHaveBeenCalledTimes(0);
  const listenPromise = barcodeScannerClient.listen();

  // Wait for listener to be bound
  await vi.waitFor(() =>
    expect(onSpy).toHaveBeenCalledWith('error', expect.any(Function))
  );

  expect(mockedTryConnect).toHaveBeenCalledTimes(1);

  return { barcodeScannerClient, listenPromise };
}

beforeEach(() => {
  vi.useFakeTimers();
  mockSocket = new PassThrough() as unknown as net.Socket;
  logger = mockLogger({
    source: LogSource.VxPollBookBackend,
    getCurrentRole: vi.fn().mockResolvedValue('system'),
    fn: vi.fn,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('isConnected', () => {
  test('returns true when device symlink exists and connected to socket', async () => {
    const tmpDir = tmp.dirSync();
    const mockDevicePath = tmp.fileSync({ tmpdir: tmpDir.name });
    const devicePath = path.join(tmpDir.name, 'mock-barcode-scanner');
    await symlink(mockDevicePath.name, devicePath);

    const { barcodeScannerClient, listenPromise } = await setUpMockSocket({
      devicePath,
    });

    expect(await barcodeScannerClient.isConnected()).toEqual(true);

    mockSocket.end();
    await listenPromise;
  });

  test('returns false when device symlink does not exist', async () => {
    const { barcodeScannerClient, listenPromise } = await setUpMockSocket({
      devicePath: '/tmp/does-not-exist',
    });

    expect(await barcodeScannerClient.isConnected()).toEqual(false);

    mockSocket.end();
    await listenPromise;
  });
});

describe('listen', () => {
  test('returns undefined if no data has been received from barcode scanner', async () => {
    const { barcodeScannerClient, listenPromise } = await setUpMockSocket();
    mockSocket.end();
    await listenPromise;

    expect(barcodeScannerClient.readPayload()).toEqual(undefined);
  });

  test('returns without error if no UDS client exists', async () => {
    const barcodeScannerClient = new BarcodeScannerClient(logger);
    expect(await barcodeScannerClient.listen()).toEqual(undefined);
  });

  test('can read from scanner socket', async () => {
    const { barcodeScannerClient, listenPromise } = await setUpMockSocket();
    const doc: AamvaDocument = {
      firstName: 'Jane',
      middleName: '',
      lastName: 'Doe',
      nameSuffix: '',
      issuingJurisdiction: 'NH',
    };
    mockSocket.write(`${JSON.stringify(doc)}\n`);
    mockSocket.end();
    await listenPromise;
    expect(barcodeScannerClient.readPayload()).toEqual(doc);
  });

  test('returns no data if TTL has elapsed', async () => {
    const { barcodeScannerClient, listenPromise } = await setUpMockSocket();
    const doc: AamvaDocument = {
      firstName: 'Jane',
      middleName: '',
      lastName: 'Doe',
      nameSuffix: '',
      issuingJurisdiction: 'NH',
    };
    mockSocket.write(`${JSON.stringify(doc)}\n`);
    mockSocket.end();
    await listenPromise;
    vi.advanceTimersByTime(SCAN_DATA_TTL_MS);
    expect(barcodeScannerClient.readPayload()).toEqual(undefined);
  });

  test('reports an error if socket sends one', async () => {
    const { barcodeScannerClient, listenPromise } = await setUpMockSocket();
    const error = 'a mock error occurred';
    mockSocket.write(`${JSON.stringify({ error })}\n`);
    mockSocket.end();
    await listenPromise;

    expect(barcodeScannerClient.readPayload()).toEqual({ error });
  });

  test('logs if error occurs during message parsing', async () => {
    const { listenPromise } = await setUpMockSocket();
    mockSocket.write('{"oops": ""\n');
    mockSocket.end();
    await listenPromise;
    expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
      LogEventId.ParseError,
      {
        message: 'Could not parse barcode scanner message',
        error: 'Unexpected end of JSON input',
      }
    );
  });

  test('schedules reconnect on "end" event', async () => {
    const { listenPromise } = await setUpMockSocket();

    // End the socket to trigger reconnection
    mockSocket.end();

    // Allow the first call to listen() to finish
    await listenPromise;

    // Allow scheduled setTimeout callbacks to run
    vi.advanceTimersByTime(UDS_CONNECTION_ATTEMPT_DELAY_MS);
    await vi.runOnlyPendingTimersAsync();

    // Expect that we have now tried to reconnect
    expect(mockedTryConnect).toHaveBeenCalledTimes(2);
  });
});

describe('connectToBarcodeScannerSocket', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('resolves with a socket from tryConnect on first try', async () => {
    mockedTryConnect.mockResolvedValueOnce(mockSocket as unknown as net.Socket);

    const socket = await connectToBarcodeScannerSocket(logger);
    expect(socket).toEqual(mockSocket);
  });

  test('retries if socket is unavailable', async () => {
    vi.useFakeTimers();
    // First call fails
    mockedTryConnect.mockRejectedValueOnce(
      new Error('Test error connecting to socket')
    );
    // Second call succeeds
    mockedTryConnect.mockResolvedValueOnce(mockSocket as unknown as net.Socket);

    // Start querying for socket
    const socketPromise = connectToBarcodeScannerSocket(logger);

    // Wait until tryConnect has been called once (failure) to advance timer
    await vi.waitFor(() => expect(mockedTryConnect).toHaveBeenCalledTimes(1));
    vi.advanceTimersByTime(UDS_CONNECTION_ATTEMPT_DELAY_MS);

    // Second attempt should succeed
    const socket = await socketPromise;
    expect(socket).toEqual(mockSocket);
    vi.useRealTimers();
  });

  test('times out of the time limit is reached', async () => {
    vi.useFakeTimers();
    // First call fails
    mockedTryConnect.mockRejectedValue(
      new Error('Test error connecting to socket')
    );

    // Start querying for socket
    const socketPromise = connectToBarcodeScannerSocket(
      logger,
      UDS_CONNECTION_ATTEMPT_DELAY_MS + 10
    );

    // Wait until tryConnect has been called once (failure) to advance timer
    await vi.waitFor(() => expect(mockedTryConnect).toHaveBeenCalledTimes(1));
    vi.advanceTimersByTime(UDS_CONNECTION_ATTEMPT_DELAY_MS);

    // Timeout should expire and function should resolve without a socket
    const socket = await socketPromise;
    expect(socket).toEqual(undefined);
    expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
      LogEventId.SocketClientConnected,
      {
        message: 'Exhausted UDS connection attempts',
        disposition: LogDispositionStandardTypes.Failure,
      }
    );
    vi.useRealTimers();
  });
});

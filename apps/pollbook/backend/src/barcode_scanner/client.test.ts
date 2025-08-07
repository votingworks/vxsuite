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
} from '@votingworks/logging';
import { tryConnect } from './unix_socket';
import {
  connectToBarcodeScannerSocket,
  BarcodeScannerClient,
  UDS_CONNECTION_ATTEMPT_DELAY_MS,
} from './client';
import { AamvaDocument } from '../types';

vi.mock('./unix_socket');

let mockSocket: net.Socket;
let logger: MockLogger;

const mockedTryConnect = tryConnect as unknown as MockedFunction<
  typeof tryConnect
>;

describe('listen', () => {
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

  // Sets up a mock UDS client and returns a Promise that resolves when
  // listen() completes
  async function setUpMockSocket(): Promise<{
    barcodeScannerClient: BarcodeScannerClient;
    listenPromise: Promise<void>;
  }> {
    const onSpy = vi.spyOn(mockSocket, 'on');

    mockedTryConnect.mockResolvedValue(mockSocket as unknown as net.Socket);

    const barcodeScannerClient = new BarcodeScannerClient(logger);
    expect(mockedTryConnect).toHaveBeenCalledTimes(0);
    const listenPromise = barcodeScannerClient.listen();

    // Wait for listener to be bound
    await vi.waitFor(() =>
      expect(onSpy).toHaveBeenCalledWith('error', expect.any(Function))
    );

    expect(mockedTryConnect).toHaveBeenCalledTimes(1);

    return { barcodeScannerClient, listenPromise };
  }

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

  test('reports an error if socket sends one', async () => {
    const { barcodeScannerClient, listenPromise } = await setUpMockSocket();
    const error = 'a mock error occurred';
    mockSocket.write(`${JSON.stringify({ error })}\n`);
    mockSocket.end();
    await listenPromise;
    expect(barcodeScannerClient.readPayload()).toEqual({ error });
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

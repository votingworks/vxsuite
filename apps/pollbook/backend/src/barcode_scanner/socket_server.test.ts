/* eslint-disable vx/gts-no-public-class-fields */

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
import { mockLogger, LogSource, MockLogger } from '@votingworks/logging';
import { tryConnect } from './unix_socket';
import {
  connectToBarcodeScannerSocket,
  SocketServer,
  UDS_CONNECTION_ATTEMPT_DELAY_MS,
} from './socket_server';

vi.mock('./unix_socket');
vi.mock('socket.io', () => ({
  Server: class {
    on = vi.fn();
    emit = vi.fn();
  },
}));

let mockSocket: net.Socket;
let logger: MockLogger;

const mockedTryConnect = tryConnect as unknown as MockedFunction<
  typeof tryConnect
>;

describe('SocketServer.listen event handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSocket = new PassThrough() as unknown as net.Socket;
    logger = mockLogger({
      source: LogSource.VxPollbookBackend,
      getCurrentRole: vi.fn().mockResolvedValue('system'),
      fn: vi.fn,
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test('schedules reconnect on "end" event', async () => {
    const onSpy = vi.spyOn(mockSocket, 'on');

    mockedTryConnect.mockResolvedValue(mockSocket as unknown as net.Socket);

    const server = new SocketServer(logger);
    expect(mockedTryConnect).toHaveBeenCalledTimes(0);
    const listenPromise = server.listen();

    // Wait for listener to be bound
    await vi.waitFor(() =>
      expect(onSpy).toHaveBeenCalledWith('error', expect.any(Function))
    );

    expect(mockedTryConnect).toHaveBeenCalledTimes(1);

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
});

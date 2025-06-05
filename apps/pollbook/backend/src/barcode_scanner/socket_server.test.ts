/* eslint-disable vx/gts-no-public-class-fields */

import { describe, test, beforeEach, afterEach, expect, vi } from 'vitest';
import type { MockedFunction } from 'vitest';
import * as net from 'node:net';
import { mockLogger, LogSource, MockLogger } from '@votingworks/logging';
import {
  connectToBarcodeScannerSocket,
  UDS_CONNECTION_ATTEMPT_DELAY_MS,
} from './socket_server';
import { tryConnect } from './unix_socket';
import { MockSocket } from '../../test/mock_socket';

vi.mock('./unix_socket');
vi.mock('socket.io', () => ({
  Server: class {
    on = vi.fn();
    emit = vi.fn();
  },
}));

const mockedTryConnect = tryConnect as unknown as MockedFunction<
  typeof tryConnect
>;

let mockSocket: MockSocket;
let logger: MockLogger;

beforeEach(() => {
  mockSocket = new MockSocket();
  logger = mockLogger({
    source: LogSource.VxPollbookBackend,
    getCurrentRole: vi.fn().mockResolvedValue('system'),
    fn: vi.fn,
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

import { describe, expect, beforeEach, afterEach, test, vi } from 'vitest';
import {
  LogEventId,
  LogDispositionStandardTypes,
  mockLogger,
  LogSource,
  MockLogger,
} from '@votingworks/logging';
import * as net from 'node:net';
import { tryConnect } from './unix_socket';
import { MockSocket } from '../../test/mock_socket';

vi.mock('node:net', async () => {
  const actual = await vi.importActual<typeof import('node:net')>('node:net');
  return {
    ...actual,
    createConnection: vi.fn(),
  };
});

describe('unix socket utils', () => {
  let mockSocket: MockSocket;
  let logger: MockLogger;

  beforeEach(() => {
    mockSocket = new MockSocket();
    vi.spyOn(net, 'createConnection').mockReturnValue(
      mockSocket as unknown as net.Socket
    );
    logger = mockLogger({
      source: LogSource.VxPollbookBackend,
      getCurrentRole: vi.fn().mockResolvedValue('system'),
      fn: vi.fn,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('tryConnect resolves with the socket when connect event fires', async () => {
    const promise = tryConnect(logger);

    // simulate underlying socket connecting
    mockSocket.emitConnect();

    const socket = await promise;
    expect(socket).toEqual(mockSocket);
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.SocketClientConnected,
      'system',
      expect.objectContaining({
        message: expect.stringContaining(
          'connected to barcode scanner Unix socket'
        ),
        disposition: LogDispositionStandardTypes.Success,
      })
    );
    expect(mockSocket.setEncoding).toHaveBeenCalledWith('utf8');
  });

  test('tryConnect rejects if error fires before connect', async () => {
    const promise = tryConnect(logger);

    mockSocket.emitError(new Error('test error'));

    await expect(promise).rejects.toThrow(
      'Pollbook backend failed to connect to barcode scanner Unix socket: test error'
    );
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.SocketClientConnected,
      'system',
      expect.objectContaining({
        message:
          'Pollbook backend failed to connect to barcode scanner Unix socket: test error',
        disposition: LogDispositionStandardTypes.Failure,
      })
    );
    expect(mockSocket.destroy).toHaveBeenCalled();
  });

  test('tryConnect logs but does not reject if error fires after connect', async () => {
    const promise = tryConnect(logger);
    mockSocket.emitConnect();
    const socket = await promise;

    mockSocket.emitError(new Error('test late error'));

    expect(socket).toEqual(mockSocket);
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.SocketClientError,
      'system',
      expect.objectContaining({
        message: 'Pollbook UDS client received an error',
        error: 'test late error',
        disposition: LogDispositionStandardTypes.Failure,
      })
    );
  });
});

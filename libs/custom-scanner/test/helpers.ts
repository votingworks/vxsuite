import { Mocked, vi } from 'vitest';
import { DuplexChannelListeners, ProtocolListeners } from '../src/mocks';

/**
 * Creates protocol listeners that are all mocks.
 */
export function makeProtocolListeners(): Mocked<ProtocolListeners> {
  return {
    onReleaseVersionRequest: vi.fn(),
    onStatusInternalRequest: vi.fn(),
    onSetScanParametersRequest: vi.fn(),
    onSetScanParametersRequestData: vi.fn(),
    onJobCreateRequest: vi.fn(),
    onJobEndRequest: vi.fn(),
    onStartScanRequest: vi.fn(),
    onGetImageDataRequest: vi.fn(),
    onStopScanRequest: vi.fn(),
    onFormMovementRequest: vi.fn(),
    onHardwareResetRequest: vi.fn(),
    onMapParametersRequest: vi.fn(),
    onMapParametersRequestData: vi.fn(),
    onUnhandledRequest: vi.fn(),
  };
}

/**
 * Creates duplex channel listeners that are all mocks.
 */
export function makeDuplexChannelListeners(): Mocked<DuplexChannelListeners> {
  return {
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    onRead: vi.fn(),
    onWrite: vi.fn(),
  };
}

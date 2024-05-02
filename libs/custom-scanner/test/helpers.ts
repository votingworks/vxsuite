import { DuplexChannelListeners, ProtocolListeners } from '../src/mocks';

/**
 * Creates protocol listeners that are all Jest mocks.
 */
export function makeProtocolListeners(): jest.Mocked<ProtocolListeners> {
  return {
    onReleaseVersionRequest: jest.fn(),
    onStatusInternalRequest: jest.fn(),
    onSetScanParametersRequest: jest.fn(),
    onSetScanParametersRequestData: jest.fn(),
    onJobCreateRequest: jest.fn(),
    onJobEndRequest: jest.fn(),
    onStartScanRequest: jest.fn(),
    onGetImageDataRequest: jest.fn(),
    onStopScanRequest: jest.fn(),
    onFormMovementRequest: jest.fn(),
    onHardwareResetRequest: jest.fn(),
    onMapParametersRequest: jest.fn(),
    onMapParametersRequestData: jest.fn(),
    onUnhandledRequest: jest.fn(),
  };
}

/**
 * Creates duplex channel listeners that are all Jest mocks.
 */
export function makeDuplexChannelListeners(): jest.Mocked<DuplexChannelListeners> {
  return {
    onConnect: jest.fn(),
    onDisconnect: jest.fn(),
    onRead: jest.fn(),
    onWrite: jest.fn(),
  };
}

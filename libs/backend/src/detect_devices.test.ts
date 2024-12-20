import { mockBaseLogger } from '@votingworks/logging';
import { detectDevices } from './detect_devices';
import { testDetectDevices } from './test_detect_devices';

test('detectDevices', () => {
  const logger = mockBaseLogger({ fn: jest.fn });
  detectDevices({ logger });
  testDetectDevices(logger);
});

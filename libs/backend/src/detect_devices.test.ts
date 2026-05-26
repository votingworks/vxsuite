import { expect, test, vi } from 'vite-plus/test';
import { mockBaseLogger } from '@votingworks/logging';
import { detectDevices } from './detect_devices';
import { testDetectDevices } from './test_detect_devices';

test('detectDevices', () => {
  const logger = mockBaseLogger({ fn: vi.fn });
  detectDevices({ logger });
  testDetectDevices(logger, expect);
});

import { expect, test, vi } from 'vitest';
import { mockBaseLogger } from '@votingworks/logging';
import { detectDevices } from './detect_devices.js';
import { testDetectDevices } from './test_detect_devices.js';

test('detectDevices', () => {
  const logger = mockBaseLogger({ fn: vi.fn });
  detectDevices({ logger });
  testDetectDevices(logger, expect);
});

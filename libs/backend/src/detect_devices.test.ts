import { expect, test, vi } from 'vitest';
import { mockBaseLogger } from '@votingworks/logging';
import { usb } from 'usb';
import { detectDevices } from './detect_devices';
import { testDetectDevices } from './test_detect_devices';

test('detectDevices', () => {
  const logger = mockBaseLogger({ fn: vi.fn });
  detectDevices({ logger });
  testDetectDevices(logger, expect);
});

test('cleanup removes listeners', () => {
  const logger = mockBaseLogger({ fn: vi.fn });
  const cleanup = detectDevices({ logger });
  testDetectDevices(logger, expect);

  cleanup();

  // After cleanup, events should not trigger further log calls
  const callCount = vi.mocked(logger.log).mock.calls.length;
  const device = {
    deviceDescriptor: { idVendor: 1, idProduct: 2 },
  } as unknown as usb.Device;
  usb.emit('attach', device);
  usb.emit('detach', device);
  expect(vi.mocked(logger.log).mock.calls.length).toEqual(callCount);
});

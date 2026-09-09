import { expect, test, vi } from 'vitest';
import { mockBaseLogger } from '@votingworks/logging';
import { usb } from 'usb';
import { detectDevices } from './detect_devices.js';
import { testDetectDevices } from './test_detect_devices.js';

test('detectDevices', () => {
  const logger = mockBaseLogger({ fn: vi.fn });
  const stopDetectingDevices = detectDevices({ logger });
  testDetectDevices(logger, expect);
  stopDetectingDevices();
});

test('cleanup removes listeners', () => {
  const logger = mockBaseLogger({ fn: vi.fn });
  const stopDetectingDevices = detectDevices({ logger });
  testDetectDevices(logger, expect);

  stopDetectingDevices();

  const callCountAfterCleanup = vi.mocked(logger.log).mock.calls.length;
  const device = {
    deviceDescriptor: { idVendor: 1, idProduct: 2 },
  } as unknown as usb.Device;
  usb.emit('attach', device);
  usb.emit('detach', device);
  expect(logger.log).toHaveBeenCalledTimes(callCountAfterCleanup);
});

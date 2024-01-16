/* istanbul ignore file - test util */

import { createMockUsbDrive } from '@votingworks/usb-drive';
import { createSystemCallApi } from './api';

jest.mock('fs/promises', () => ({
  ...jest.requireActual('fs/promises'),
  stat: jest.fn().mockRejectedValue(new Error('not mocked yet')),
}));

jest.mock('../exec', (): typeof import('../exec') => ({
  ...jest.requireActual('../exec'),
  execFile: jest.fn(),
}));

test('API - exportLogsToUsb', async () => {
  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive({});

  const api = createSystemCallApi({
    usbDrive: mockUsbDrive.usbDrive,
    machineId: 'TEST-MACHINE-ID',
  });

  expect((await api.exportLogsToUsb()).err()).toEqual('no-logs-directory');
});

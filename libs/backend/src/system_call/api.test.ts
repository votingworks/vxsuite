/* istanbul ignore file - test util */

import { MockUsbDrive, createMockUsbDrive } from '@votingworks/usb-drive';
import { mockOf } from '@votingworks/test-utils';
import { SystemCallApi, createSystemCallApi } from './api';
import { execFile } from '../exec';

jest.mock('fs/promises', () => ({
  ...jest.requireActual('fs/promises'),
  stat: jest.fn().mockRejectedValue(new Error('not mocked yet')),
}));

jest.mock('../exec', (): typeof import('../exec') => ({
  ...jest.requireActual('../exec'),
  execFile: jest.fn(),
}));

const execMock = mockOf(execFile);

let mockUsbDrive: MockUsbDrive;
let api: SystemCallApi;

beforeEach(() => {
  mockUsbDrive = createMockUsbDrive();
  api = createSystemCallApi({
    usbDrive: mockUsbDrive.usbDrive,
    machineId: 'TEST-MACHINE-ID',
  });
});

test('exportLogsToUsb', async () => {
  expect((await api.exportLogsToUsb()).err()).toEqual('no-logs-directory');
});

test('reboot', () => {
  api.reboot();
  expect(execMock).toHaveBeenCalledWith('systemctl', ['reboot', '-i']);
});

test('rebootToBios', () => {
  api.rebootToBios();
  expect(execMock).toHaveBeenCalledWith('systemctl', [
    'reboot',
    '--firmware-setup',
    '-i',
  ]);
});

test('powerDown', () => {
  api.powerDown();
  expect(execMock).toHaveBeenCalledWith('systemctl', ['poweroff', '-i']);
});

test('setClock', async () => {
  await api.setClock({
    isoDatetime: '2020-11-03T15:00Z',
    ianaZone: 'America/Chicago',
  });

  expect(execMock).toHaveBeenNthCalledWith(1, 'sudo', [
    '-n',
    'timedatectl',
    'set-timezone',
    'America/Chicago',
  ]);

  expect(execMock).toHaveBeenNthCalledWith(2, 'sudo', [
    '-n',
    'timedatectl',
    'set-time',
    '2020-11-03 09:00:00',
  ]);
});

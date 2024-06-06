/* istanbul ignore file - test util */

import { MockUsbDrive, createMockUsbDrive } from '@votingworks/usb-drive';
import { mockOf } from '@votingworks/test-utils';
import { LogEventId, Logger, mockLogger } from '@votingworks/logging';
import { SystemCallApi, createSystemCallApi } from './api';
import { execFile } from '../exec';
import { getAudioInfo } from './get_audio_info';

jest.mock('fs/promises', () => ({
  ...jest.requireActual('fs/promises'),
  stat: jest.fn().mockRejectedValue(new Error('not mocked yet')),
}));

jest.mock('../exec', (): typeof import('../exec') => ({
  ...jest.requireActual('../exec'),
  execFile: jest.fn(),
}));

jest.mock('./get_audio_info');

const execMock = mockOf(execFile);

let mockUsbDrive: MockUsbDrive;
let logger: Logger;
let api: SystemCallApi;

beforeEach(() => {
  mockUsbDrive = createMockUsbDrive();
  logger = mockLogger();
  api = createSystemCallApi({
    usbDrive: mockUsbDrive.usbDrive,
    logger,
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

test('rebootToBios', async () => {
  await api.rebootToBios();
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.RebootMachine,
    {
      message: 'User trigged a reboot of the machine to BIOS screen…',
    }
  );
  expect(execMock).toHaveBeenCalledWith('systemctl', [
    'reboot',
    '--firmware-setup',
    '-i',
  ]);
});

test('powerDown', async () => {
  await api.powerDown();
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(LogEventId.PowerDown, {
    message: 'User triggered the machine to power down.',
  });
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

test('getAudioInfo', async () => {
  mockOf(getAudioInfo).mockResolvedValue({ headphonesActive: true });
  await expect(api.getAudioInfo()).resolves.toEqual({ headphonesActive: true });
});

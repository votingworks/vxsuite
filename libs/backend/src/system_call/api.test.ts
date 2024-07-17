/* istanbul ignore file - test util */
/* eslint-disable prefer-regex-literals */

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
  expect(execMock).toHaveBeenCalledWith('sudo', [
    expect.stringMatching(
      new RegExp('^/.*/libs/backend/src/intermediate-scripts/reboot$')
    ),
  ]);
});

test('rebootToBios', async () => {
  await api.rebootToBios();
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.RebootMachine,
    {
      message: 'User trigged a reboot of the machine to BIOS screen…',
    }
  );
  expect(execMock).toHaveBeenCalledWith('sudo', [
    expect.stringMatching(
      new RegExp('^/.*/libs/backend/src/intermediate-scripts/reboot-to-bios$')
    ),
  ]);
});

test('powerDown', async () => {
  await api.powerDown();
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(LogEventId.PowerDown, {
    message: 'User triggered the machine to power down.',
  });
  expect(execMock).toHaveBeenCalledWith('sudo', [
    expect.stringMatching(
      new RegExp('^/.*/libs/backend/src/intermediate-scripts/power-down$')
    ),
  ]);
});

test('setClock', async () => {
  await api.setClock({
    isoDatetime: '2020-11-03T15:00Z',
    ianaZone: 'America/Chicago',
  });

  expect(execMock).toHaveBeenNthCalledWith(1, 'sudo', [
    expect.stringMatching(
      new RegExp('^/.*/libs/backend/src/intermediate-scripts/set-clock$')
    ),
    'America/Chicago',
    '2020-11-03 09:00:00',
  ]);
});

test('getAudioInfo', async () => {
  mockOf(getAudioInfo).mockResolvedValue({ headphonesActive: true });
  await expect(api.getAudioInfo()).resolves.toEqual({ headphonesActive: true });
});

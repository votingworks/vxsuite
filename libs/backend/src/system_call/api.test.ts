/* istanbul ignore file - test util */
/* eslint-disable prefer-regex-literals */

import { MockUsbDrive, createMockUsbDrive } from '@votingworks/usb-drive';
import { mockOf } from '@votingworks/test-utils';
import { LogEventId, MockLogger, mockLogger } from '@votingworks/logging';
import { SystemCallApi, createSystemCallApi } from './api';
import { execFile } from '../exec';
import { getAudioInfo } from './get_audio_info';

jest.mock('node:fs/promises', () => ({
  ...jest.requireActual('node:fs/promises'),
  stat: jest.fn().mockRejectedValue(new Error('not mocked yet')),
}));

jest.mock('../exec', (): typeof import('../exec') => ({
  ...jest.requireActual('../exec'),
  execFile: jest.fn(),
}));

jest.mock('./get_audio_info');

const execMock = mockOf(execFile);

let mockUsbDrive: MockUsbDrive;
let logger: MockLogger;
let api: SystemCallApi;

beforeEach(() => {
  (process.env.VX_CONFIG_ROOT as string) = '/vx/config';
  mockUsbDrive = createMockUsbDrive();
  logger = mockLogger({ fn: jest.fn });
  api = createSystemCallApi({
    usbDrive: mockUsbDrive.usbDrive,
    logger,
    machineId: 'TEST-MACHINE-ID',
    codeVersion: 'TEST-CODE-VERSION',
  });
});

test('exportLogsToUsb', async () => {
  expect((await api.exportLogsToUsb({ format: 'vxf' })).err()).toEqual(
    'no-logs-directory'
  );
});

test('rebootToVendorMenu', async () => {
  await api.rebootToVendorMenu();
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.RebootMachine,
    {
      message: 'Vendor rebooted the machine into the vendor menu.',
    }
  );
  expect(execMock).toHaveBeenCalledWith('sudo', [
    expect.stringMatching(
      new RegExp(
        '^/.*/libs/backend/src/intermediate-scripts/reboot-to-vendor-menu$'
      )
    ),
    '/vx/config/app-flags',
  ]);
});

test('rebootToVendorMenu in dev', async () => {
  delete (process.env as unknown as { VX_CONFIG_ROOT: undefined })
    .VX_CONFIG_ROOT;

  await api.rebootToVendorMenu();
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.RebootMachine,
    {
      message: 'Vendor rebooted the machine into the vendor menu.',
    }
  );
  expect(execMock).toHaveBeenCalledWith('sudo', [
    expect.stringMatching(
      new RegExp(
        '^/.*/libs/backend/src/intermediate-scripts/reboot-to-vendor-menu$'
      )
    ),
    '/tmp',
  ]);
});

test('powerDown', async () => {
  await api.powerDown();
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(LogEventId.PowerDown, {
    message: 'User powered down the machine.',
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

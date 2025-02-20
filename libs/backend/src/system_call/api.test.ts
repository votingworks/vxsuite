/* eslint-disable prefer-regex-literals */

import { beforeEach, expect, test, vi } from 'vitest';
import { MockUsbDrive, createMockUsbDrive } from '@votingworks/usb-drive';
import { LogEventId, MockLogger, mockLogger } from '@votingworks/logging';
import { SystemCallApi, createSystemCallApi } from './api';
import { execFile } from '../exec';
import { getAudioInfo } from './get_audio_info';

vi.mock(import('node:fs/promises'), async (importActual) => ({
  ...(await importActual()),
  stat: vi.fn().mockRejectedValue(new Error('not mocked yet')),
}));

vi.mock(
  import('../exec.js'),
  async (importActual): Promise<typeof import('../exec')> => ({
    ...(await importActual()),
    execFile: vi.fn(),
  })
);

vi.mock(import('./get_audio_info.js'));

let mockUsbDrive: MockUsbDrive;
let logger: MockLogger;
let api: SystemCallApi;

beforeEach(() => {
  vi.clearAllMocks();
  (process.env.VX_CONFIG_ROOT as string) = '/vx/config';
  mockUsbDrive = createMockUsbDrive();
  logger = mockLogger({ fn: vi.fn });
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
  expect(execFile).toHaveBeenCalledWith('sudo', [
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
  expect(execFile).toHaveBeenCalledWith('sudo', [
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
  expect(execFile).toHaveBeenCalledWith('sudo', [
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

  expect(execFile).toHaveBeenNthCalledWith(1, 'sudo', [
    expect.stringMatching(
      new RegExp('^/.*/libs/backend/src/intermediate-scripts/set-clock$')
    ),
    'America/Chicago',
    '2020-11-03 09:00:00',
  ]);
});

test('getAudioInfo', async () => {
  vi.mocked(getAudioInfo).mockResolvedValue({ headphonesActive: true });
  await expect(api.getAudioInfo()).resolves.toEqual({ headphonesActive: true });
});

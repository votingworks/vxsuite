/* eslint-disable prefer-regex-literals */

import { beforeEach, expect, test, vi, afterEach } from 'vitest';
import { MockUsbDrive, createMockUsbDrive } from '@votingworks/usb-drive';
import { LogEventId, MockLogger, mockLogger } from '@votingworks/logging';
import { SystemCallApiMethods, createSystemCallApi } from './api';
import { execFile } from '../exec';
import { AudioInfo, getAudioInfo } from './get_audio_info';
import { LogsExportError } from './export_logs_to_usb';

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

const actualTimezone = process.env.TZ;

let mockUsbDrive: MockUsbDrive;
let logger: MockLogger;
let api: SystemCallApiMethods;

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

// setClock changes the process's TZ variable so it must be reset
afterEach(() => {
  process.env = {
    ...process.env,
    TZ: actualTimezone,
  };
});

test('exportLogsToUsb', async () => {
  expect(
    (await api.exportLogsToUsb({ format: 'vxf' })).err()
  ).toEqual<LogsExportError>({ code: 'no-logs-directory' });
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
        '^/.*/libs/backend/intermediate-scripts/reboot-to-vendor-menu$'
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
        '^/.*/libs/backend/intermediate-scripts/reboot-to-vendor-menu$'
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
      new RegExp('^/.*/libs/backend/intermediate-scripts/power-down$')
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
      new RegExp('^/.*/libs/backend/intermediate-scripts/set-clock$')
    ),
    'America/Chicago',
    '2020-11-03 09:00:00',
  ]);
});

test('getAudioInfo', async () => {
  const audioInfo: AudioInfo = {
    builtin: {
      headphonesActive: false,
      name: 'alsa_output.pci.analog-stereo',
    },
    usb: {
      name: 'alsa_output.usb.stereo',
    },
  };
  vi.mocked(getAudioInfo).mockResolvedValue(audioInfo);
  await expect(api.getAudioInfo()).resolves.toEqual(audioInfo);
});

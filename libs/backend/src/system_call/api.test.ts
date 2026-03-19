/* eslint-disable prefer-regex-literals */

import { beforeEach, expect, test, vi, afterEach } from 'vitest';
import { MockUsbDrive, createMockUsbDrive } from '@votingworks/usb-drive';
import { LogEventId, MockLogger, mockLogger } from '@votingworks/logging';
import type { DiskSpaceSummary } from '@votingworks/utils';
import { SystemCallApiMethods, createSystemCallApi } from './api.js';
import { execFile } from '../exec.js';
import { AudioInfo, getAudioInfo } from './get_audio_info.js';
import { BatteryInfo, getBatteryInfo } from './get_battery_info.js';
import { LogsExportError } from './export_logs_to_usb.js';
import { getDiskSpaceSummary } from './get_disk_space_summary.js';

vi.mock(import('node:fs/promises'), async (importActual) => ({
  ...(await importActual()),
  stat: vi.fn().mockRejectedValue(new Error('not mocked yet')),
}));

vi.mock(
  import('../exec.js'),
  async (importActual): Promise<typeof import('../exec.js')> => ({
    ...(await importActual()),
    execFile: vi.fn(),
  })
);

vi.mock(import('./get_audio_info.js'));
vi.mock(import('./get_battery_info.js'));
vi.mock(import('./get_disk_space_summary.js'));

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
    workspacePath: 'TEST-WORKSPACE-PATH',
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

test('getBatteryInfo', async () => {
  const batteryInfo: BatteryInfo = {
    level: 0.75,
    discharging: false,
  };
  vi.mocked(getBatteryInfo).mockResolvedValue(batteryInfo);
  await expect(api.getBatteryInfo()).resolves.toEqual(batteryInfo);
  expect(getBatteryInfo).toHaveBeenCalledWith({ logger });
});

test('getDiskSpaceSummary logs when disk space is low', async () => {
  const diskSpaceSummaryLowAvailable: DiskSpaceSummary = {
    total: 1000,
    used: 990,
    available: 10,
  };
  vi.mocked(getDiskSpaceSummary).mockResolvedValue(
    diskSpaceSummaryLowAvailable
  );
  expect(await api.getDiskSpaceSummary()).toEqual(diskSpaceSummaryLowAvailable);
  expect(getDiskSpaceSummary).toHaveBeenCalledWith(['TEST-WORKSPACE-PATH']);
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.LowDiskSpace,
    expect.objectContaining({
      message: 'Free disk space is down to 1% (10.0 KB of 1000.0 KB).',
    })
  );
});

test('getDiskSpaceSummary does not log when disk space is sufficient', async () => {
  const diskSpaceSummaryPlentyAvailable: DiskSpaceSummary = {
    total: 1000,
    used: 500,
    available: 500,
  };
  vi.mocked(getDiskSpaceSummary).mockResolvedValue(
    diskSpaceSummaryPlentyAvailable
  );
  expect(await api.getDiskSpaceSummary()).toEqual(
    diskSpaceSummaryPlentyAvailable
  );
  expect(getDiskSpaceSummary).toHaveBeenCalledWith(['TEST-WORKSPACE-PATH']);
  expect(logger.logAsCurrentRole).not.toHaveBeenCalled();
});

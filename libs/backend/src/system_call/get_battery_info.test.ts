import { mockOf } from '@votingworks/test-utils';
import { readFile } from 'fs/promises';
import { getBatteryInfo } from './get_battery_info';

jest.mock('fs/promises');

const readFileMock = mockOf(readFile);

test('parses battery info to determine battery level and charging status', async () => {
  readFileMock.mockResolvedValueOnce(`
POWER_SUPPLY_ENERGY_NOW=800
POWER_SUPPLY_ENERGY_FULL=1000
POWER_SUPPLY_STATUS=Charging
`);
  await expect(getBatteryInfo()).resolves.toEqual({
    level: 0.8,
    discharging: false,
  });
});

test('parses battery status "Full" to indicate battery is not discharging', async () => {
  readFileMock.mockResolvedValue(`
POWER_SUPPLY_ENERGY_NOW=800
POWER_SUPPLY_ENERGY_FULL=1000
POWER_SUPPLY_STATUS=Full
  `);
  await expect(getBatteryInfo()).resolves.toEqual({
    level: 0.8,
    discharging: false,
  });
});

test('parses battery status "Unknown" to indicate battery is not discharging', async () => {
  readFileMock.mockResolvedValue(`
POWER_SUPPLY_ENERGY_NOW=800
POWER_SUPPLY_ENERGY_FULL=1000
POWER_SUPPLY_STATUS=Unknown
  `);
  await expect(getBatteryInfo()).resolves.toEqual({
    level: 0.8,
    discharging: false,
  });
});

test('parses battery status "Discharging" to indicate battery is discharging', async () => {
  readFileMock.mockResolvedValue(`
POWER_SUPPLY_ENERGY_NOW=800
POWER_SUPPLY_ENERGY_FULL=1000
POWER_SUPPLY_STATUS=Discharging
  `);
  await expect(getBatteryInfo()).resolves.toEqual({
    level: 0.8,
    discharging: true,
  });
});

test('can read battery info for a battery at a different path', async () => {
  // BAT0 does not exist
  readFileMock.mockRejectedValueOnce(new Error('ENOENT'));

  // BAT1 exists
  readFileMock.mockResolvedValueOnce(`
POWER_SUPPLY_ENERGY_NOW=800
POWER_SUPPLY_ENERGY_FULL=1000
POWER_SUPPLY_STATUS=Discharging
`);

  expect(await getBatteryInfo()).toEqual({ level: 0.8, discharging: true });
  expect(readFileMock).toHaveBeenNthCalledWith(
    1,
    '/sys/class/power_supply/BAT0/uevent',
    'utf8'
  );
  expect(readFileMock).toHaveBeenNthCalledWith(
    2,
    '/sys/class/power_supply/BAT1/uevent',
    'utf8'
  );
});

test('returns undefined if the power_supply "files" are not present', async () => {
  readFileMock.mockRejectedValue(new Error('ENOENT'));
  expect(await getBatteryInfo()).toBeUndefined();
});

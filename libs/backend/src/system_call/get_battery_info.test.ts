import { mockOf } from '@votingworks/test-utils';
import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { tmpNameSync } from 'tmp';
import { getBatteryInfo, parseBatteryInfo } from './get_battery_info';

jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  createReadStream: jest.fn(),
}));
const { createReadStream: realCreateReadStream } =
  jest.requireActual('node:fs');
const createReadStreamMock = mockOf(createReadStream) as jest.Mock;

createReadStreamMock.mockImplementation(realCreateReadStream);

test('parses battery info to determine battery level and charging status', async () => {
  const batteryInfo = await parseBatteryInfo(
    Readable.from(`
POWER_SUPPLY_ENERGY_NOW=800
POWER_SUPPLY_ENERGY_FULL=1000
POWER_SUPPLY_STATUS=Charging
`)
  );
  expect(batteryInfo).toEqual({
    level: 0.8,
    discharging: false,
  });
});

test('parses battery status "Full" to indicate battery is not discharging', async () => {
  const batteryInfo = await parseBatteryInfo(
    Readable.from(`
POWER_SUPPLY_ENERGY_NOW=800
POWER_SUPPLY_ENERGY_FULL=1000
POWER_SUPPLY_STATUS=Full
  `)
  );
  expect(batteryInfo).toEqual({
    level: 0.8,
    discharging: false,
  });
});

test('parses battery status "Unknown" to indicate battery is not discharging', async () => {
  const batteryInfo = await parseBatteryInfo(
    Readable.from(`
POWER_SUPPLY_ENERGY_NOW=800
POWER_SUPPLY_ENERGY_FULL=1000
POWER_SUPPLY_STATUS=Unknown
  `)
  );
  expect(batteryInfo).toEqual({
    level: 0.8,
    discharging: false,
  });
});

test('parses battery status "Discharging" to indicate battery is discharging', async () => {
  const batteryInfo = await parseBatteryInfo(
    Readable.from(`
POWER_SUPPLY_ENERGY_NOW=800
POWER_SUPPLY_ENERGY_FULL=1000
POWER_SUPPLY_STATUS=Discharging
  `)
  );
  expect(batteryInfo).toEqual({
    level: 0.8,
    discharging: true,
  });
});

test('can read battery info for a battery at a different path', async () => {
  const bat1File = tmpNameSync();
  await writeFile(
    bat1File,
    `
POWER_SUPPLY_ENERGY_NOW=800
POWER_SUPPLY_ENERGY_FULL=1000
POWER_SUPPLY_STATUS=Discharging
  `
  );

  // BAT0 does not exist
  createReadStreamMock.mockImplementationOnce(() => {
    throw new Error('ENOENT');
  });

  // BAT1 exists
  createReadStreamMock.mockReturnValueOnce(
    realCreateReadStream(bat1File, 'utf8')
  );

  expect(await getBatteryInfo()).toEqual({ level: 0.8, discharging: true });
  expect(createReadStreamMock).toHaveBeenNthCalledWith(
    1,
    '/sys/class/power_supply/BAT0/uevent',
    'utf8'
  );
  expect(createReadStreamMock).toHaveBeenNthCalledWith(
    2,
    '/sys/class/power_supply/BAT1/uevent',
    'utf8'
  );
});

test('returns null if the power_supply "files" are not present', async () => {
  createReadStreamMock
    .mockImplementationOnce(() => {
      throw new Error('ENOENT');
    })
    .mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });
  expect(await getBatteryInfo()).toBeNull();
});

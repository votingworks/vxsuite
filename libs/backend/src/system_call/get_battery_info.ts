import { Optional } from '@votingworks/basics';
import { safeParseNumber } from '@votingworks/types';
import { readFile } from 'fs/promises';

enum BatteryStatus {
  Charging = 'Charging',
  Discharging = 'Discharging',
  NotCharging = 'Not charging',
  Full = 'Full',
  Unknown = 'Unknown',
}

/**
 * Information about the computer battery. `level` is a number between 0 and 1.
 * `discharging` means that the computer is not plugged in and is running on
 * battery power.
 */
export interface BatteryInfo {
  level: number;
  discharging: boolean;
}

/**
 * Parses battery info text in `uevent` format.
 */
function parseBatteryInfo(batteryInfoText: string): BatteryInfo {
  const batteryInfo = batteryInfoText
    .trim()
    .split('\n')
    .reduce((data, line) => {
      const [key, value] = line.split('=');
      // some keys in the `uevent` file lack values
      if (key && value) {
        data.set(key, value);
      }
      return data;
    }, new Map<string, string>());
  const energyNow = batteryInfo.get('POWER_SUPPLY_ENERGY_NOW');
  const energyFull = batteryInfo.get('POWER_SUPPLY_ENERGY_FULL');
  const status = batteryInfo.get('POWER_SUPPLY_STATUS') as BatteryStatus;
  const level =
    safeParseNumber(energyNow).unsafeUnwrap() /
    safeParseNumber(energyFull).unsafeUnwrap();
  const discharging = status === BatteryStatus.Discharging;
  return { level, discharging };
}

/**
 * Get battery info for the main system battery.
 */
export async function getBatteryInfo(): Promise<Optional<BatteryInfo>> {
  for (const batteryPath of ['BAT0', 'BAT1']) {
    try {
      return parseBatteryInfo(
        await readFile(`/sys/class/power_supply/${batteryPath}/uevent`, 'utf8')
      );
    } catch {
      // ignore missing paths
    }
  }
  return undefined;
}

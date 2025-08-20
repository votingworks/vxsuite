import { lines } from '@votingworks/basics';
import { LogEventId, Logger } from '@votingworks/logging';
import { safeParseNumber } from '@votingworks/types';
import { createReadStream } from 'node:fs';

enum BatteryStatus {
  Charging = 'Charging',
  Discharging = 'Discharging',
  NotCharging = 'Not charging',
  Full = 'Full',
  Unknown = 'Unknown',
}

/**
 * Information about the computer battery.
 */
export interface BatteryInfo {
  /** A number between 0 (empty) and 1 (full). */
  level: number;

  /** Whether the computer is unplugged and running on battery power. */
  discharging: boolean;
}

/**
 * Parses battery info text in `uevent` format.
 */
export async function parseBatteryInfo(
  batteryInfoInput: AsyncIterable<string>
): Promise<BatteryInfo> {
  const batteryInfo = await lines(batteryInfoInput).reduce((data, line) => {
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
 * Get battery info for the main system battery. If no battery info is found,
 * returns null (react-query doesn't accept `undefined`).
 */
export async function getBatteryInfo({
  logger,
}: {
  logger: Logger;
}): Promise<BatteryInfo | null> {
  for (const batteryPath of ['BAT0', 'BAT1']) {
    try {
      const batteryInfo = await parseBatteryInfo(
        createReadStream(
          `/sys/class/power_supply/${batteryPath}/uevent`,
          'utf8'
        )
      );

      // It's possible for the battery level to be outside of the range. For
      // example, when the battery level goes beyond the previously expected
      // capacity and the capacity is not yet updated.
      if (batteryInfo.level < 0 || batteryInfo.level > 1) {
        logger.log(LogEventId.UnexpectedHardwareDeviceResponse, 'system', {
          disposition: 'failure',
          message: `System reported an invalid battery level: ${batteryInfo.level}`,
        });

        // Return null to indicate that the battery level is invalid.
        return null;
      }

      return batteryInfo;
    } catch {
      // ignore missing paths
    }
  }
  return null;
}

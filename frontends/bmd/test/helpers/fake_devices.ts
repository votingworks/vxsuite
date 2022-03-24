import { fakePrinterInfo } from '@votingworks/test-utils';
import { Devices } from '@votingworks/ui';

interface PartialDevices {
  printer?: Partial<Devices['printer']>;
  computer?: Partial<Devices['computer']>;
}
export function fakeDevices(devices: PartialDevices = {}): Devices {
  return {
    printer: fakePrinterInfo(devices.printer),
    computer: {
      batteryLevel: 0.8,
      batteryIsLow: false,
      batteryIsCharging: true,
      ...(devices.computer ?? {}),
    },
  };
}

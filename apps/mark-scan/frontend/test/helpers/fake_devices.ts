import { mockDevices, mockPrinterInfo } from '@votingworks/test-utils';
import { Devices } from '@votingworks/ui';

interface PartialDevices {
  printer?: Partial<Devices['printer']>;
  computer?: Partial<Devices['computer']>;
  accessibleController?: Devices['accessibleController'];
}
export function mockDevices(devices: PartialDevices = {}): Devices {
  return {
    printer: mockPrinterInfo(devices.printer),
    computer: {
      batteryLevel: 0.8,
      batteryIsLow: false,
      batteryIsCharging: true,
      ...(devices.computer ?? {}),
    },
    accessibleController: mockDevices(devices.accessibleController),
  };
}

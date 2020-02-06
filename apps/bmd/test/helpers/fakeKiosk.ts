// Disable `import/no-unresolved` because this module only exists for TypeScript.
// eslint-disable-next-line import/no-unresolved
import { Kiosk, BatteryInfo, PrinterInfo, Device } from 'kiosk-browser'

export function fakeDevice(props: Partial<Device> = {}): Device {
  return {
    deviceName: 'fake device',
    deviceAddress: 0,
    locationId: 0,
    manufacturer: 'Acme Inc.',
    productId: 0,
    serialNumber: '12345',
    vendorId: 0,
    ...props,
  }
}

export function fakePrinterInfo(props: Partial<PrinterInfo> = {}): PrinterInfo {
  return {
    connected: false,
    description: props.name ?? 'Fake Printer',
    isDefault: false,
    name: 'Fake Printer',
    status: 3, // idle
    ...props,
  }
}

/**
 * Builds a `Kiosk` instance with mock methods.
 */
export default function fakeKiosk({
  battery: { level = 1, discharging = false } = {},
  printers,
}: {
  battery?: Partial<BatteryInfo>
  printers?: Partial<PrinterInfo>[]
} = {}): jest.Mocked<Kiosk> {
  if (!printers) {
    printers = [{}]
  }

  printers = printers.map(fakePrinterInfo)

  return {
    print: jest.fn().mockResolvedValue(undefined),
    getBatteryInfo: jest.fn().mockResolvedValue({ level, discharging }),
    getPrinterInfo: jest.fn().mockResolvedValue(printers),
    getDeviceList: jest.fn().mockResolvedValue([]),
    onDeviceChange: {
      add: jest.fn(),
      remove: jest.fn(),
      trigger: jest.fn(),
    },
    quit: jest.fn(),
  }
}

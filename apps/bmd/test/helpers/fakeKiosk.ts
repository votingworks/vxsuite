import { BehaviorSubject } from 'rxjs'

// Disable `import/no-unresolved` because this module only exists for TypeScript.
export function fakeDevice(
  props: Partial<KioskBrowser.Device> = {}
): KioskBrowser.Device {
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

export function fakePrinterInfo(
  props: Partial<KioskBrowser.PrinterInfo> = {}
): KioskBrowser.PrinterInfo {
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
  printers = [{}],
}: {
  battery?: Partial<KioskBrowser.BatteryInfo>
  printers?: Partial<KioskBrowser.PrinterInfo>[]
} = {}): jest.Mocked<KioskBrowser.Kiosk> {
  return {
    setClock: jest.fn().mockResolvedValue(undefined),
    print: jest.fn().mockResolvedValue(undefined),
    getBatteryInfo: jest.fn().mockResolvedValue({ level, discharging }),
    getPrinterInfo: jest.fn().mockResolvedValue(printers.map(fakePrinterInfo)),
    devices: new BehaviorSubject(new Set<KioskBrowser.Device>()),
    quit: jest.fn(),
  }
}

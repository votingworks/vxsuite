import { BehaviorSubject } from 'rxjs'

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

export function fakeUsbDrive(
  props: Partial<KioskBrowser.UsbDrive> = {}
): KioskBrowser.UsbDrive {
  return {
    deviceName: 'fake device',
    mountPoint: 'fake mount point',
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
export function fakeKiosk({
  battery: { level = 1, discharging = false } = {},
  printers = [{}],
}: {
  battery?: Partial<KioskBrowser.BatteryInfo>
  printers?: Partial<KioskBrowser.PrinterInfo>[]
} = {}): jest.Mocked<KioskBrowser.Kiosk> & {
  devices: BehaviorSubject<Set<KioskBrowser.Device>>
  printers: BehaviorSubject<Set<KioskBrowser.PrinterInfo>>
} {
  return {
    print: jest.fn().mockResolvedValue(undefined),
    printToPDF: jest.fn().mockResolvedValue(Buffer.of()),
    getBatteryInfo: jest.fn().mockResolvedValue({ level, discharging }),
    getPrinterInfo: jest.fn().mockResolvedValue(printers.map(fakePrinterInfo)),
    devices: new BehaviorSubject(new Set<KioskBrowser.Device>()),
    printers: new BehaviorSubject(new Set<KioskBrowser.PrinterInfo>()),
    quit: jest.fn(),
    saveAs: jest.fn().mockResolvedValue(undefined),
    getUsbDrives: jest.fn().mockResolvedValue([]),
    mountUsbDrive: jest.fn(),
    unmountUsbDrive: jest.fn(),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockResolvedValue(''),
    getFileSystemEntries: jest.fn().mockResolvedValue([]),
    makeDirectory: jest.fn(),
    storage: {
      set: jest.fn(),
      get: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn(),
    },
    setClock: jest.fn(),
  }
}

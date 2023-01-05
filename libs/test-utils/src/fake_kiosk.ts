import { Buffer } from 'buffer';
import { BehaviorSubject } from './observable';

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
  };
}

export function fakeUsbDrive(
  props: Partial<KioskBrowser.UsbDriveInfo> = {}
): KioskBrowser.UsbDriveInfo {
  return {
    deviceName: 'fake device',
    mountPoint: 'fake mount point',
    ...props,
  };
}

export function fakeMarkerInfo(
  props: Partial<KioskBrowser.IppMarkerInfo> = {}
): KioskBrowser.IppMarkerInfo {
  return {
    color: '#000000',
    highLevel: 100,
    level: 92,
    lowLevel: 2,
    name: 'black cartridge',
    type: 'toner-cartridge',
    ...props,
  };
}

export function fakePrinterInfo(
  props: Partial<KioskBrowser.PrinterInfo> = {}
): KioskBrowser.PrinterInfo {
  return {
    connected: false,
    description: props.name ?? 'Fake Printer',
    isDefault: false,
    name: 'Fake Printer',
    state: 'idle',
    stateReasons: ['none'],
    markerInfos: [fakeMarkerInfo()],
    ...props,
  };
}

/**
 * Builds a `Kiosk` instance with mock methods.
 */
export function fakeKiosk({
  battery: { level = 1, discharging = false } = {},
  printers = [{}],
}: {
  battery?: Partial<KioskBrowser.BatteryInfo>;
  printers?: Array<Partial<KioskBrowser.PrinterInfo>>;
} = {}): jest.Mocked<KioskBrowser.Kiosk> & {
  devices: BehaviorSubject<Set<KioskBrowser.Device>>;
  printers: BehaviorSubject<Set<KioskBrowser.PrinterInfo>>;
} {
  return {
    print: jest.fn().mockResolvedValue(undefined),
    // TODO: Rename to `printToPdf` in kiosk-browser, then update here.
    // eslint-disable-next-line vx/gts-identifiers
    printToPDF: jest.fn().mockResolvedValue(Buffer.of()),
    getBatteryInfo: jest.fn().mockResolvedValue({ level, discharging }),
    getPrinterInfo: jest.fn().mockResolvedValue(printers.map(fakePrinterInfo)),
    devices: new BehaviorSubject(new Set<KioskBrowser.Device>()),
    printers: new BehaviorSubject(new Set<KioskBrowser.PrinterInfo>()),
    quit: jest.fn(),
    saveAs: jest.fn().mockResolvedValue(undefined),
    getUsbDriveInfo: jest.fn().mockResolvedValue([]),
    mountUsbDrive: jest.fn().mockResolvedValue(undefined),
    unmountUsbDrive: jest.fn().mockResolvedValue(undefined),
    formatUsbDrive: jest.fn().mockResolvedValue(undefined),
    syncUsbDrive: jest.fn().mockResolvedValue(undefined),
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
    totp: {
      get: jest.fn(),
    },
    sign: jest.fn(),
    speak: jest.fn().mockResolvedValue(undefined),
    cancelSpeak: jest.fn().mockResolvedValue(undefined),
    log: jest.fn(),
    reboot: jest.fn(),
    rebootToBios: jest.fn(),
    prepareToBootFromUsb: jest.fn(),
  };
}

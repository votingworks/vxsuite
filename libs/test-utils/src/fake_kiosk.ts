import { Buffer } from 'buffer';
import { BehaviorSubject } from './observable';

export function mockDevices(
  props: Partial<KioskBrowser.Device> = {}
): KioskBrowser.Device {
  return {
    deviceName: 'mock device',
    deviceAddress: 0,
    locationId: 0,
    manufacturer: 'Acme Inc.',
    productId: 0,
    serialNumber: '12345',
    vendorId: 0,
    ...props,
  };
}

export function mockMarkerInfo(
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

export function mockPrinterInfo(
  props: Partial<KioskBrowser.PrinterInfo> = {}
): KioskBrowser.PrinterInfo {
  return {
    connected: false,
    description: props.name ?? 'Mock Printer',
    isDefault: false,
    name: 'Mock Printer',
    state: 'idle',
    stateReasons: ['none'],
    markerInfos: [mockMarkerInfo()],
    ...props,
  };
}

export type MockKiosk = jest.Mocked<KioskBrowser.Kiosk> & {
  devices: BehaviorSubject<Set<KioskBrowser.Device>>;
  printers: BehaviorSubject<Set<KioskBrowser.PrinterInfo>>;
};

/**
 * Builds a `Kiosk` instance with mock methods.
 */
export function mockKiosk({
  battery: { level = 1, discharging = false } = {},
  printers = [{}],
}: {
  battery?: Partial<KioskBrowser.BatteryInfo>;
  printers?: Array<Partial<KioskBrowser.PrinterInfo>>;
} = {}): MockKiosk {
  return {
    print: jest.fn().mockResolvedValue(undefined),
    // TODO: Rename to `printToPdf` in kiosk-browser, then update here.
    // eslint-disable-next-line vx/gts-identifiers
    printToPDF: jest.fn().mockResolvedValue(Buffer.of()),
    getBatteryInfo: jest.fn().mockResolvedValue({ level, discharging }),
    getPrinterInfo: jest.fn().mockResolvedValue(printers.map(mockPrinterInfo)),
    devices: new BehaviorSubject(new Set<KioskBrowser.Device>()),
    printers: new BehaviorSubject(new Set<KioskBrowser.PrinterInfo>()),
    quit: jest.fn(),
    saveAs: jest.fn().mockResolvedValue(undefined),
    log: jest.fn(),
    captureScreenshot: jest.fn().mockResolvedValue(Buffer.of()),
    showOpenDialog: jest.fn(),
    showSaveDialog: jest.fn(),
  };
}

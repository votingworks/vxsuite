import { BehaviorSubject, Observable } from '../observable';
import { Hardware } from '../types';
import {
  AccessibleControllerProductId,
  AccessibleControllerVendorId,
  BrotherHll5100DnProductId,
  BrotherHll5100DnVendorId,
  OmniKeyCardReaderDeviceName,
  OmniKeyCardReaderManufacturer,
  OmniKeyCardReaderProductId,
  OmniKeyCardReaderVendorId,
  FujitsuScannerVendorId,
  FujitsuFi7160ScannerProductId,
  PlustekScannerVendorId,
  PlustekVtm300ScannerProductId,
  isPrinter,
} from './utils';

const DEFAULT_BATTERY_STATUS: KioskBrowser.BatteryInfo = {
  discharging: false,
  level: 0.8,
};

const DEFAULT_PRINTER_IPP_ATTRIBUTES: KioskBrowser.PrinterIppAttributes = {
  state: 'idle',
  stateReasons: ['none'],
  markerInfos: [
    {
      color: '#000000',
      highLevel: 100,
      level: 92,
      lowLevel: 2,
      name: 'black cartridge',
      type: 'toner-cartridge',
    },
  ],
};

/* eslint-disable @typescript-eslint/require-await */

/**
 * Implements the `Hardware` API with an in-memory implementation.
 */
export class MemoryHardware implements Hardware {
  private batteryStatus? = DEFAULT_BATTERY_STATUS;

  private connectedDevices = new Set<KioskBrowser.Device>();

  private accessibleController: Readonly<KioskBrowser.Device> = {
    deviceAddress: 0,
    deviceName: 'USB Advanced Audio Device',
    locationId: 0,
    manufacturer: 'C-Media Electronics Inc.',
    productId: AccessibleControllerProductId,
    vendorId: AccessibleControllerVendorId,
    serialNumber: '',
  };

  private printer: Readonly<KioskBrowser.Device> = {
    deviceAddress: 0,
    deviceName: 'HL-L5100DN_series',
    locationId: 0,
    manufacturer: 'Brother',
    productId: BrotherHll5100DnProductId,
    vendorId: BrotherHll5100DnVendorId,
    serialNumber: '',
  };

  private printerIppAttributes = DEFAULT_PRINTER_IPP_ATTRIBUTES;

  private cardReader: Readonly<KioskBrowser.Device> = {
    deviceAddress: 0,
    deviceName: OmniKeyCardReaderDeviceName,
    locationId: 0,
    manufacturer: OmniKeyCardReaderManufacturer,
    vendorId: OmniKeyCardReaderVendorId,
    productId: OmniKeyCardReaderProductId,
    serialNumber: '',
  };

  private batchScanner: Readonly<KioskBrowser.Device> = {
    deviceAddress: 0,
    deviceName: 'Scanner',
    locationId: 0,
    manufacturer: 'Fujitsu',
    vendorId: FujitsuScannerVendorId,
    productId: FujitsuFi7160ScannerProductId,
    serialNumber: '',
  };

  private precinctScanner: Readonly<KioskBrowser.Device> = {
    deviceAddress: 0,
    deviceName: 'Sheetfed Scanner',
    locationId: 0,
    manufacturer: 'Plustek Inc.',
    vendorId: PlustekScannerVendorId,
    productId: PlustekVtm300ScannerProductId,
    serialNumber: '',
  };

  static build({
    connectPrinter = false,
    connectAccessibleController = false,
    connectCardReader = false,
    connectBatchScanner = false,
    connectPrecinctScanner = false,
  }: {
    connectPrinter?: boolean;
    connectAccessibleController?: boolean;
    connectCardReader?: boolean;
    connectBatchScanner?: boolean;
    connectPrecinctScanner?: boolean;
  } = {}): MemoryHardware {
    const newMemoryHardware = new MemoryHardware();
    newMemoryHardware.setPrinterConnected(connectPrinter);
    newMemoryHardware.setAccessibleControllerConnected(
      connectAccessibleController
    );
    newMemoryHardware.setCardReaderConnected(connectCardReader);
    newMemoryHardware.setBatchScannerConnected(connectBatchScanner);
    newMemoryHardware.setPrecinctScannerConnected(connectPrecinctScanner);
    return newMemoryHardware;
  }

  static buildStandard(): MemoryHardware {
    return MemoryHardware.build({
      connectPrinter: true,
      connectAccessibleController: true,
      connectCardReader: true,
      connectBatchScanner: true,
      connectPrecinctScanner: true,
    });
  }

  static buildDemo(): MemoryHardware {
    return MemoryHardware.build({
      connectPrinter: true,
      connectAccessibleController: false,
      connectCardReader: true,
      connectBatchScanner: true,
      connectPrecinctScanner: true,
    });
  }

  /**
   * Sets Accessible Controller connected
   */
  setAccessibleControllerConnected(connected: boolean): void {
    this.setDeviceConnected(this.accessibleController, connected);
  }

  /**
   * Sets Batch Scanner connected
   */
  setBatchScannerConnected(connected: boolean): void {
    this.setDeviceConnected(this.batchScanner, connected);
  }

  /**
   * Sets Precinct Scanner connected
   */
  setPrecinctScannerConnected(connected: boolean): void {
    this.setDeviceConnected(this.precinctScanner, connected);
  }

  /**
   * Reads Battery status
   */
  async readBatteryStatus(): Promise<KioskBrowser.BatteryInfo | undefined> {
    // Return a copy of the battery status to more realistically simulate the
    // behavior of `KioskHardware`.
    return this.batteryStatus ? { ...this.batteryStatus } : undefined;
  }

  /**
   * Sets Battery discharging
   */
  setBatteryDischarging(discharging: boolean): void {
    this.batteryStatus = {
      ...(this.batteryStatus ?? DEFAULT_BATTERY_STATUS),
      discharging,
    };
  }

  /**
   * Sets Battery level. Number between 0–1.
   */
  setBatteryLevel(level: number): void {
    this.batteryStatus = {
      ...(this.batteryStatus ?? DEFAULT_BATTERY_STATUS),
      level,
    };
  }

  /**
   * Removes the battery from the device.
   */
  removeBattery(): void {
    this.batteryStatus = undefined;
  }

  /**
   * Sets Card Reader connected
   */
  setCardReaderConnected(connected: boolean): void {
    this.setDeviceConnected(this.cardReader, connected);
  }

  /**
   * Reads Printer status
   */
  async readPrinterStatus(): Promise<KioskBrowser.PrinterInfo | undefined> {
    const connectedPrinter = Array.from(this.connectedDevices).find(isPrinter);
    if (connectedPrinter) {
      return {
        connected: true,
        name: connectedPrinter.deviceName,
        description: connectedPrinter.manufacturer,
        isDefault: true,
        ...this.printerIppAttributes,
      };
    }
    return undefined;
  }

  /**
   * Sets Printer connected
   */
  setPrinterConnected(connected: boolean): void {
    this.setDeviceConnected(this.printer, connected);
    this.printersSubject.next([
      {
        name: this.printer.deviceName,
        description: this.printer.manufacturer,
        connected,
        isDefault: true,
        ...this.printerIppAttributes,
      },
    ]);
  }

  /**
   * Sets Printer IPP attributes
   */
  setPrinterIppAttributes(attributes: KioskBrowser.PrinterIppAttributes): void {
    this.printerIppAttributes = attributes;
  }

  /**
   * Detaches all printers
   */
  detachAllPrinters(): void {
    this.printersSubject.next([]);
  }

  private devicesSubject = new BehaviorSubject(this.connectedDevices);

  /**
   * Subscribe to USB device updates.
   */
  // eslint-disable-next-line vx/gts-no-public-class-fields
  readonly devices: Observable<Iterable<KioskBrowser.Device>> =
    this.devicesSubject;

  private printersSubject = new BehaviorSubject<
    Iterable<KioskBrowser.PrinterInfo>
  >([]);

  /**
   * Subscribe to printer updates.
   */
  // eslint-disable-next-line vx/gts-no-public-class-fields
  readonly printers: Observable<Iterable<KioskBrowser.PrinterInfo>> =
    this.printersSubject;

  /**
   * Determines whether a device is in the list of connected devices.
   */
  hasDevice(device: KioskBrowser.Device): boolean {
    return this.connectedDevices.has(device);
  }

  /**
   * Sets the connection status for a device by adding or removing it as needed.
   */
  setDeviceConnected(device: KioskBrowser.Device, connected: boolean): void {
    if (connected !== this.hasDevice(device)) {
      if (connected) {
        this.addDevice(device);
      } else {
        this.removeDevice(device);
      }
    }
  }

  /**
   * Adds a device to the set of connected devices.
   */
  addDevice(device: KioskBrowser.Device): void {
    if (this.connectedDevices.has(device)) {
      throw new Error(
        `cannot add device that was already added: ${device.deviceName}`
      );
    }

    this.connectedDevices.add(device);
    this.devicesSubject.next(this.connectedDevices);
  }

  /**
   * Removes a previously-added device from the set of connected devices.
   */
  removeDevice(device: KioskBrowser.Device): void {
    const hadDevice = this.connectedDevices.delete(device);

    if (!hadDevice) {
      throw new Error(
        `cannot remove device that was never added: ${device.deviceName}`
      );
    }

    this.devicesSubject.next(this.connectedDevices);
  }
}

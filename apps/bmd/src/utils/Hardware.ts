import { Observable, BehaviorSubject } from 'rxjs'

interface PrinterStatus {
  connected: boolean
}

export const AccessibleControllerVendorId = 0x0d8c
export const AccessibleControllerProductId = 0x0170

export const BrotherHLL5100DNVendorId = 0x04f9
export const BrotherHLL5100DNProductId = 0x007f

/**
 * Determines whether a device is the accessible controller.
 */
export function isAccessibleController(device: KioskBrowser.Device): boolean {
  return (
    device.vendorId === AccessibleControllerVendorId &&
    device.productId === AccessibleControllerProductId
  )
}

export const OmniKeyCardReaderDeviceName = 'OMNIKEY 3x21 Smart Card Reader'
export const OmniKeyCardReaderManufacturer = 'HID Global'
export const OmniKeyCardReaderVendorId = 0x076b
export const OmniKeyCardReaderProductId = 0x3031

/**
 * Determines whether a device is the card reader.
 */
export function isCardReader(device: KioskBrowser.Device): boolean {
  return (
    (device.manufacturer.replace(/_/g, ' ') === OmniKeyCardReaderManufacturer &&
      device.deviceName.replace(/_/g, ' ') === OmniKeyCardReaderDeviceName) ||
    (device.vendorId === OmniKeyCardReaderVendorId &&
      device.productId === OmniKeyCardReaderProductId)
  )
}

/**
 * Determines whether a device is a supported printer.
 */
export function isPrinter(device: KioskBrowser.Device): boolean {
  return (
    device.vendorId === BrotherHLL5100DNVendorId &&
    device.productId === BrotherHLL5100DNProductId
  )
}

/**
 * Defines the API for accessing hardware status.
 */
export interface Hardware {
  /**
   * Reads Battery status
   */
  readBatteryStatus(): Promise<KioskBrowser.BatteryInfo>

  /**
   * Reads Printer status
   */
  readPrinterStatus(): Promise<PrinterStatus>

  /**
   * Subscribe to USB device updates.
   */
  devices: Observable<Iterable<KioskBrowser.Device>>
}

/**
 * Implements the `Hardware` API with an in-memory implementation.
 */
export class MemoryHardware implements Hardware {
  private batteryStatus: KioskBrowser.BatteryInfo = {
    discharging: false,
    level: 0.8,
  }

  private connectedDevices = new Set<KioskBrowser.Device>()

  private accessibleController: Readonly<KioskBrowser.Device> = {
    deviceAddress: 0,
    deviceName: 'USB Advanced Audio Device',
    locationId: 0,
    manufacturer: 'C-Media Electronics Inc.',
    productId: AccessibleControllerProductId,
    vendorId: AccessibleControllerVendorId,
    serialNumber: '',
  }

  private printer: Readonly<KioskBrowser.Device> = {
    deviceAddress: 0,
    deviceName: 'HL-L5100DN_series',
    locationId: 0,
    manufacturer: 'Brother',
    productId: BrotherHLL5100DNProductId,
    vendorId: BrotherHLL5100DNVendorId,
    serialNumber: '',
  }

  private cardReader: Readonly<KioskBrowser.Device> = {
    deviceAddress: 0,
    deviceName: OmniKeyCardReaderDeviceName,
    locationId: 0,
    manufacturer: OmniKeyCardReaderManufacturer,
    vendorId: OmniKeyCardReaderVendorId,
    productId: OmniKeyCardReaderProductId,
    serialNumber: '',
  }

  public constructor({
    connectPrinter = false,
    connectAccessibleController = false,
    connectCardReader = false,
  }: {
    connectPrinter?: boolean
    connectAccessibleController?: boolean
    connectCardReader?: boolean
  } = {}) {
    this.setPrinterConnected(connectPrinter)
    this.setAccesssibleControllerConnected(connectAccessibleController)
    this.setCardReaderConnected(connectCardReader)
  }

  public static get standard(): MemoryHardware {
    return new MemoryHardware({
      connectPrinter: true,
      connectAccessibleController: true,
      connectCardReader: true,
    })
  }

  public static get demo(): MemoryHardware {
    return new MemoryHardware({
      connectPrinter: true,
      connectAccessibleController: false,
      connectCardReader: true,
    })
  }

  /**
   * Sets Accessible Controller connected
   */
  public async setAccesssibleControllerConnected(
    connected: boolean
  ): Promise<void> {
    this.setDeviceConnected(this.accessibleController, connected)
  }

  /**
   * Reads Battery status
   */
  public async readBatteryStatus(): Promise<KioskBrowser.BatteryInfo> {
    return this.batteryStatus
  }

  /**
   * Sets Battery discharging
   */
  public async setBatteryDischarging(discharging: boolean): Promise<void> {
    this.batteryStatus = {
      ...this.batteryStatus,
      discharging,
    }
  }

  /**
   * Sets Battery level. Number between 0–1.
   */
  public async setBatteryLevel(level: number): Promise<void> {
    this.batteryStatus = {
      ...this.batteryStatus,
      level,
    }
  }

  /**
   * Sets Card Reader connected
   */
  public async setCardReaderConnected(connected: boolean): Promise<void> {
    this.setDeviceConnected(this.cardReader, connected)
  }

  /**
   * Reads Printer status
   */
  public async readPrinterStatus(): Promise<PrinterStatus> {
    return {
      connected: Array.from(this.connectedDevices).some(isPrinter),
    }
  }

  /**
   * Sets Printer connected
   */
  public async setPrinterConnected(connected: boolean): Promise<void> {
    this.setDeviceConnected(this.printer, connected)
  }

  private devicesSubject = new BehaviorSubject(this.connectedDevices)

  /**
   * Subscribe to USB device updates.
   */
  public devices: Observable<Iterable<KioskBrowser.Device>> = this
    .devicesSubject

  /**
   * Determines whether a device is in the list of connected devices.
   */
  public hasDevice(device: KioskBrowser.Device): boolean {
    return this.connectedDevices.has(device)
  }

  /**
   * Sets the connection status for a device by adding or removing it as needed.
   */
  public setDeviceConnected(
    device: KioskBrowser.Device,
    connected: boolean
  ): void {
    if (connected !== this.hasDevice(device)) {
      if (connected) {
        this.addDevice(device)
      } else {
        this.removeDevice(device)
      }
    }
  }

  /**
   * Adds a device to the set of connected devices.
   */
  public addDevice(device: KioskBrowser.Device): void {
    if (this.connectedDevices.has(device)) {
      throw new Error(
        `cannot add device that was already added: ${device.deviceName}`
      )
    }

    this.connectedDevices.add(device)
    this.devicesSubject.next(this.connectedDevices)
  }

  /**
   * Removes a previously-added device from the set of connected devices.
   */
  public removeDevice(device: KioskBrowser.Device): void {
    const hadDevice = this.connectedDevices.delete(device)

    if (!hadDevice) {
      throw new Error(
        `cannot remove device that was never added: ${device.deviceName}`
      )
    }

    this.devicesSubject.next(this.connectedDevices)
  }
}

/**
 * Implements the `Hardware` API by accessing it through the kiosk.
 */
export class KioskHardware extends MemoryHardware {
  public constructor(private kiosk: KioskBrowser.Kiosk) {
    super()
  }

  /**
   * Reads Battery status
   */
  public async readBatteryStatus(): Promise<KioskBrowser.BatteryInfo> {
    return this.kiosk.getBatteryInfo()
  }

  /**
   * Determines whether there is a configured & connected printer.
   */
  public async readPrinterStatus(): Promise<PrinterStatus> {
    const printers = await this.kiosk.getPrinterInfo()
    return { connected: printers.some((printer) => printer.connected) }
  }

  /**
   * Gets an observable that yields the current set of connected USB devices as
   * devices are added and removed.
   *
   * Given a set of initial devices (e.g. {mouse, keyboard}), a subscriber would
   * receive the initial set. Once a new device is added (e.g. flash drive), that
   * first subscriber receives a new set (e.g. {mouse, keyboard, flash drive}).
   * New subscribers immediately receive the same current set.
   */
  public devices = this.kiosk.devices
}

/**
 * Get Hardware based upon environment.
 */
export const getHardware = (): Hardware =>
  window.kiosk
    ? // Running in kiosk-browser, so use that to access real hardware.
      new KioskHardware(window.kiosk)
    : // Running in normal browser, so emulate hardware.
      MemoryHardware.demo

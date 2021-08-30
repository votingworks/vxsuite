import { BehaviorSubject, Observable } from 'rxjs'
import { Hardware, PrinterStatus } from '../types'
import {
  AccessibleControllerProductId,
  AccessibleControllerVendorId,
  BrotherHLL5100DNProductId,
  BrotherHLL5100DNVendorId,
  isPrinter,
  OmniKeyCardReaderDeviceName,
  OmniKeyCardReaderManufacturer,
  OmniKeyCardReaderProductId,
  OmniKeyCardReaderVendorId,
} from './utils'

/**
 * Implements the `Hardware` API with an in-memory implementation.
 */
export default class MemoryHardware implements Hardware {
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

  public static async build({
    connectPrinter = false,
    connectAccessibleController = false,
    connectCardReader = false,
  }: {
    connectPrinter?: boolean
    connectAccessibleController?: boolean
    connectCardReader?: boolean
  } = {}): Promise<MemoryHardware> {
    const newMemoryHardware = new MemoryHardware()
    await newMemoryHardware.setPrinterConnected(connectPrinter)
    await newMemoryHardware.setAccessibleControllerConnected(
      connectAccessibleController
    )
    await newMemoryHardware.setCardReaderConnected(connectCardReader)
    return newMemoryHardware
  }

  public static async buildStandard(): Promise<MemoryHardware> {
    return await MemoryHardware.build({
      connectPrinter: true,
      connectAccessibleController: true,
      connectCardReader: true,
    })
  }

  public static async buildDemo(): Promise<MemoryHardware> {
    return await MemoryHardware.build({
      connectPrinter: true,
      connectAccessibleController: false,
      connectCardReader: true,
    })
  }

  /**
   * Sets Accessible Controller connected
   */
  public async setAccessibleControllerConnected(
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
    this.printersSubject.next([
      {
        connected,
        name: this.printer.deviceName,
        description: this.printer.manufacturer,
        isDefault: true,
        status: 0,
      },
    ])
  }

  private devicesSubject = new BehaviorSubject(this.connectedDevices)

  /**
   * Subscribe to USB device updates.
   */
  public devices: Observable<Iterable<KioskBrowser.Device>> =
    this.devicesSubject

  private printersSubject = new BehaviorSubject<
    Iterable<KioskBrowser.PrinterInfo>
  >([])

  /**
   * Subscribe to printer updates.
   */
  public printers: Observable<Iterable<KioskBrowser.PrinterInfo>> =
    this.printersSubject

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

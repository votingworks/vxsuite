import {
  Kiosk,
  BatteryInfo,
  Device,
  Listeners,
  ChangeType,
  Listener,
  // eslint-disable-next-line import/no-unresolved
} from 'kiosk-browser'

import fetchJSON from './fetchJSON'

interface AccessibleControllerStatus {
  connected: boolean
}
interface CardReaderStatus {
  connected: boolean
}
interface PrinterStatus {
  connected: boolean
}

export const AccessibleControllerVendorId = 0x0d8c
export const AccessibleControllerProductId = 0x0170

/**
 * Determines whether a device is the accessible controller.
 */
export function isAccessibleController(device: Device): boolean {
  return (
    device.vendorId === AccessibleControllerVendorId &&
    device.productId === AccessibleControllerProductId
  )
}

/**
 * Defines the API for accessing hardware status.
 */
export interface Hardware {
  /**
   * Reads Battery status
   */
  readBatteryStatus(): Promise<BatteryInfo>

  /**
   * Reads Card Reader status
   */
  readCardReaderStatus(): Promise<CardReaderStatus>

  /**
   * Reads Printer status
   */
  readPrinterStatus(): Promise<PrinterStatus>

  /**
   * Manage notifications for device changes.
   */
  onDeviceChange: Listeners<[ChangeType, Device]>
}

/**
 * Implements the `Hardware` API with an in-memory implementation.
 */
export class MemoryHardware implements Hardware {
  private batteryStatus: BatteryInfo = {
    discharging: false,
    level: 0.8,
  }
  private cardReaderStatus: CardReaderStatus = {
    connected: true,
  }
  private printerStatus: PrinterStatus = {
    connected: true,
  }
  private devices = new Set<Device>()

  private accessibleController: Readonly<Device> = {
    deviceAddress: 0,
    deviceName: 'USB Advanced Audio Device',
    locationId: 0,
    manufacturer: 'C-Media Electronics Inc.',
    productId: AccessibleControllerProductId,
    vendorId: AccessibleControllerVendorId,
    serialNumber: '',
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
  public async readBatteryStatus(): Promise<BatteryInfo> {
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
   * Reads Card Reader status
   */
  public async readCardReaderStatus(): Promise<CardReaderStatus> {
    return this.cardReaderStatus
  }

  /**
   * Sets Card Reader connected
   */
  public async setCardReaderConnected(connected: boolean): Promise<void> {
    this.cardReaderStatus = { connected }
  }

  /**
   * Reads Printer status
   */
  public async readPrinterStatus(): Promise<PrinterStatus> {
    return this.printerStatus
  }

  /**
   * Sets Printer connected
   */
  public async setPrinterConnected(connected: boolean): Promise<void> {
    this.printerStatus = { connected }
  }

  /**
   * Manage notifications for device changes.
   */
  public onDeviceChange: Listeners<[ChangeType, Device]> = (() => {
    const callbacks = new Set<
      (changeType: ChangeType, device: Device) => void
    >()

    return {
      add: (
        callback: (changeType: ChangeType, device: Device) => void
      ): Listener<[ChangeType, Device]> => {
        callbacks.add(callback)

        for (const device of this.devices) {
          callback(0 /* ChangeType.Add */, device)
        }

        return {
          remove() {
            callbacks.delete(callback)
          },
        }
      },

      remove: (
        callback: (changeType: ChangeType, device: Device) => void
      ): void => {
        callbacks.delete(callback)
      },

      trigger: (changeType: ChangeType, device: Device): void => {
        for (const callback of callbacks) {
          callback(changeType, device)
        }
      },
    }
  })()

  /**
   * Gets a list of connected devices.
   */
  public getDeviceList(): Device[] {
    return Array.from(this.devices)
  }

  /**
   * Determines whether a device is in the list of connected devices.
   */
  public hasDevice(device: Device): boolean {
    return this.devices.has(device)
  }

  /**
   * Sets the connection status for a device by adding or removing it as needed.
   */
  public setDeviceConnected(device: Device, connected: boolean): void {
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
  public addDevice(device: Device): void {
    if (this.devices.has(device)) {
      throw new Error(
        `cannot add device that was already added: ${device.deviceName}`
      )
    }

    this.devices.add(device)
    this.onDeviceChange.trigger(0 /* ChangeType.Add */, device)
  }

  /**
   * Removes a previously-added device from the set of connected devices.
   */
  public removeDevice(device: Device): void {
    const hadDevice = this.devices.delete(device)

    if (!hadDevice) {
      throw new Error(
        `cannot remove device that was never added: ${device.deviceName}`
      )
    }

    this.onDeviceChange.trigger(1 /* ChangeType.Remove */, device)
  }
}

/**
 * Implements the `Hardware` API with just a web browser
 */
export class WebBrowserHardware extends MemoryHardware {
  /**
   * Reads Card Reader status
   */
  public async readCardReaderStatus(): Promise<CardReaderStatus> {
    return await fetchJSON<CardReaderStatus>('/card/reader')
  }
}

/**
 * Implements the `Hardware` API by accessing it through the kiosk.
 */
export class KioskHardware extends WebBrowserHardware {
  public constructor(private kiosk: Kiosk) {
    super()
  }

  /**
   * Reads Battery status
   */
  public async readBatteryStatus(): Promise<BatteryInfo> {
    return this.kiosk.getBatteryInfo()
  }

  /**
   * Determines whether there is a configured & connected printer.
   */
  public async readPrinterStatus(): Promise<PrinterStatus> {
    const printers = await this.kiosk.getPrinterInfo()
    return { connected: printers.some(printer => printer.connected) }
  }

  onDeviceChange = this.kiosk.onDeviceChange
}

/**
 * Get Hardware based upon environment.
 */
export const getHardware = () =>
  window.kiosk ? new KioskHardware(window.kiosk) : new WebBrowserHardware()

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

/**
 * Defines the API for accessing hardware status.
 */
export interface Hardware {
  /**
   * Reads Accessible Controller status
   */
  readAccesssibleControllerStatus(): Promise<AccessibleControllerStatus>

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
  private accessibleControllerStatus: AccessibleControllerStatus = {
    connected: true,
  }
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

  /**
   * Reads Accessible Controller status
   */
  public async readAccesssibleControllerStatus(): Promise<
    AccessibleControllerStatus
  > {
    return this.accessibleControllerStatus
  }

  /**
   * Sets Accessible Controller connected
   */
  public async setAccesssibleControllerConnected(
    connected: boolean
  ): Promise<void> {
    this.accessibleControllerStatus = { connected }
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
    const listeners = new Set<
      (changeType: ChangeType, device: Device) => void
    >()

    return {
      add: (
        callback: (changeType: ChangeType, device: Device) => void
      ): Listener<[ChangeType, Device]> => {
        listeners.add(callback)

        return {
          remove() {
            listeners.delete(callback)
          },
        }
      },

      remove: (
        callback: (changeType: ChangeType, device: Device) => void
      ): void => {
        listeners.delete(callback)
      },

      trigger: (changeType: ChangeType, device: Device): void => {
        for (const callback of listeners) {
          callback(changeType, device)
        }
      },
    }
  })()

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
    this.kiosk = kiosk
  }

  /**
   * Determines whether a device is the accessible controller.
   */
  private isAccessibleController(device: Device): boolean {
    return device.vendorId === 0x0d8c && device.productId === 0x0170
  }

  /**
   * Reads Battery status
   */
  public async readBatteryStatus(): Promise<BatteryInfo> {
    return this.kiosk.getBatteryInfo()
  }

  /**
   * Reads accessible controller status by checking the connected devices.
   */
  public async readAccesssibleControllerStatus(): Promise<
    AccessibleControllerStatus
  > {
    for (const device of await this.kiosk.getDeviceList()) {
      if (this.isAccessibleController(device)) {
        return { connected: true }
      }
    }

    return { connected: false }
  }

  /**
   * Determines whether there is a configured & connected printer.
   */
  public async readPrinterStatus(): Promise<PrinterStatus> {
    const printers = await this.kiosk.getPrinterInfo()
    return { connected: printers.some(printer => printer.connected) }
  }
}

/**
 * Get Hardware based upon environment.
 */
export const getHardware = () =>
  window.kiosk ? new KioskHardware(window.kiosk) : new WebBrowserHardware()

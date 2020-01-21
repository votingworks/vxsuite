// eslint-disable-next-line import/no-unresolved
import { Kiosk, BatteryInfo, Device } from 'kiosk-browser'

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
}

/**
 * Implements the `Hardware` API by accessing it through the kiosk.
 */
export class KioskHardware extends MemoryHardware {
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
  window.kiosk ? new KioskHardware(window.kiosk) : new MemoryHardware()

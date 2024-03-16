import { MemoryHardware } from './memory_hardware';

/**
 * Implements the `Hardware` API by accessing it through the kiosk.
 */
export class KioskHardware extends MemoryHardware {
  constructor(private readonly kiosk: KioskBrowser.Kiosk) {
    super();
    this.devices = this.kiosk.devices;
    this.printers = this.kiosk.printers;
  }

  /**
   * Reads Battery status
   */
  async readBatteryStatus(): Promise<KioskBrowser.BatteryInfo | undefined> {
    return this.kiosk.getBatteryInfo();
  }

  /**
   * Finds a configured & connected printer and returns its status.
   */
  async readPrinterStatus(): Promise<KioskBrowser.PrinterInfo | undefined> {
    const printers = await this.kiosk.getPrinterInfo();
    return printers.find((printer) => printer.connected);
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
  // eslint-disable-next-line vx/gts-no-public-class-fields
  readonly devices: typeof this.kiosk.devices;

  /**
   * Gets an observable that yields the current set of printers as printers are
   * configured or devices are added or removed.
   */
  // eslint-disable-next-line vx/gts-no-public-class-fields
  readonly printers: typeof this.kiosk.printers;
}

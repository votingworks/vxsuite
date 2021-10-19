import { PrinterStatus } from '../types';
import MemoryHardware from './MemoryHardware';

/**
 * Implements the `Hardware` API by accessing it through the kiosk.
 */
export default class KioskHardware extends MemoryHardware {
  constructor(private kiosk: KioskBrowser.Kiosk) {
    super();
  }

  /**
   * Reads Battery status
   */
  async readBatteryStatus(): Promise<KioskBrowser.BatteryInfo> {
    return this.kiosk.getBatteryInfo();
  }

  /**
   * Determines whether there is a configured & connected printer.
   */
  async readPrinterStatus(): Promise<PrinterStatus> {
    const printers = await this.kiosk.getPrinterInfo();
    return { connected: printers.some((printer) => printer.connected) };
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
  devices = this.kiosk.devices;

  /**
   * Gets an observable that yields the current set of printers as printers are
   * configured or devices are added or removed.
   */
  printers = this.kiosk.printers;
}

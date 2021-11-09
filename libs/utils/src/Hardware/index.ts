import { Hardware } from '../types';
import { KioskHardware } from './kiosk_hardware';
import { MemoryHardware } from './memory_hardware';

export * from './kiosk_hardware';
export * from './memory_hardware';
export * from './utils';

/**
 * Get Hardware based upon environment.
 */
export async function getHardware(): Promise<Hardware> {
  return window.kiosk
    ? // Running in kiosk-browser, so use that to access real hardware.
      new KioskHardware(window.kiosk)
    : // Running in normal browser, so emulate hardware.
      await MemoryHardware.buildDemo();
}

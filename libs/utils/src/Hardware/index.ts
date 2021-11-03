import { Hardware } from '../types';
import { KioskHardware } from './KioskHardware';
import { MemoryHardware } from './MemoryHardware';

export * from './KioskHardware';
export * from './MemoryHardware';
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

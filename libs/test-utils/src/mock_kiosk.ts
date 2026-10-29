// @coverage-defer-file
import type { vi, Mocked } from 'vitest';

export type MockKiosk = Mocked<KioskBrowser.Kiosk>;

/**
 * Builds a `Kiosk` instance with mock methods.
 */
export function mockKiosk(fn: typeof vi.fn): MockKiosk {
  return {
    log: fn(),
    showOpenDialog: fn(),
    reboot: fn(),
  };
}

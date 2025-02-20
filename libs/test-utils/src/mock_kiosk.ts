import type { vi, Mocked } from 'vitest';

export type MockKiosk = Mocked<KioskBrowser.Kiosk>;

/**
 * Builds a `Kiosk` instance with mock methods.
 */
export function mockKiosk(fn: typeof vi.fn): MockKiosk {
  return {
    quit: fn(),
    log: fn(),
    captureScreenshot: fn().mockResolvedValue(Uint8Array.of()),
    showOpenDialog: fn(),
  };
}

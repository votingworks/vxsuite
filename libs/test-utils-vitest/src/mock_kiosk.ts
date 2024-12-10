import { Mocked, vi } from 'vitest';

export type MockKiosk = Mocked<KioskBrowser.Kiosk>;

/**
 * Builds a `Kiosk` instance with mock methods.
 */
export function mockKiosk(): MockKiosk {
  return {
    quit: vi.fn(),
    log: vi.fn(),
    captureScreenshot: vi.fn().mockResolvedValue(Uint8Array.of()),
    showOpenDialog: vi.fn(),
  };
}

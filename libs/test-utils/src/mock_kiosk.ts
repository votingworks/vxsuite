/* eslint-disable @typescript-eslint/no-explicit-any */
import type { vi, Mocked } from 'vitest';

export type MockKiosk<T = typeof jest.fn> = T extends typeof jest.fn
  ? jest.Mocked<KioskBrowser.Kiosk>
  : T extends typeof vi.fn
  ? Mocked<KioskBrowser.Kiosk>
  : jest.Mocked<KioskBrowser.Kiosk>;

/**
 * Builds a `Kiosk` instance with mock methods.
 */
export function mockKiosk(): MockKiosk;
export function mockKiosk(fn: typeof jest.fn): MockKiosk<typeof jest.fn>;
export function mockKiosk(fn: typeof vi.fn): MockKiosk<typeof vi.fn>;
export function mockKiosk(
  fn: any = jest.fn
): MockKiosk<typeof jest.fn> | MockKiosk<typeof vi.fn> {
  return {
    quit: fn(),
    log: fn(),
    captureScreenshot: fn().mockResolvedValue(Uint8Array.of()),
    showOpenDialog: fn(),
  };
}

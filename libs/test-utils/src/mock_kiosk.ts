export type MockKiosk = jest.Mocked<KioskBrowser.Kiosk>;

/**
 * Builds a `Kiosk` instance with mock methods.
 */
export function mockKiosk(): MockKiosk {
  return {
    quit: jest.fn(),
    log: jest.fn(),
    captureScreenshot: jest.fn().mockResolvedValue(Uint8Array.of()),
    showOpenDialog: jest.fn(),
  };
}

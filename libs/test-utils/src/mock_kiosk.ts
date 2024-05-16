import { Buffer } from 'buffer';

export type MockKiosk = jest.Mocked<KioskBrowser.Kiosk>;

/**
 * Builds a `Kiosk` instance with mock methods.
 */
export function mockKiosk(): MockKiosk {
  return {
    quit: jest.fn(),
    saveAs: jest.fn().mockResolvedValue(undefined),
    log: jest.fn(),
    captureScreenshot: jest.fn().mockResolvedValue(Buffer.of()),
    showOpenDialog: jest.fn(),
    showSaveDialog: jest.fn(),
  };
}

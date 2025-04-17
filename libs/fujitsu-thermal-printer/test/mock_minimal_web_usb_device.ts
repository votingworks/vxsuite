import { Mocked, vi } from 'vitest';
import { MinimalWebUsbDevice } from '../src/driver/minimal_web_usb_device';

export function mockMinimalWebUsbDevice(): Mocked<MinimalWebUsbDevice> {
  return {
    open: vi.fn(),
    close: vi.fn(),
    transferOut: vi.fn(),
    controlTransferIn: vi.fn(),
    claimInterface: vi.fn(),
    releaseInterface: vi.fn(),
    selectConfiguration: vi.fn(),
  };
}

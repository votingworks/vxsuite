import { MinimalWebUsbDevice } from './minimal_web_usb_device';

export function mockMinimalWebUsbDevice(): MinimalWebUsbDevice {
  return {
    open: () => Promise.resolve(),
    close: () => Promise.resolve(),
    transferOut: () => Promise.resolve(new USBOutTransferResult('ok')),
    controlTransferIn: () => Promise.resolve(new USBInTransferResult('ok')),
    claimInterface: (): Promise<void> => Promise.resolve(),
    releaseInterface: (): Promise<void> => Promise.resolve(),
    selectConfiguration(): Promise<void> {
      return Promise.resolve();
    },
  };
}

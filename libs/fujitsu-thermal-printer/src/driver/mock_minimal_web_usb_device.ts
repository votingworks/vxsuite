import { MinimalWebUsbDevice } from './minimal_web_usb_device';

export function mockMinimalWebUsbDevice(): MinimalWebUsbDevice {
  return {
    open: () => {
      return Promise.resolve();
    },
    close: () => {
      return Promise.resolve();
    },
    transferOut: () => {
      return Promise.resolve(new USBOutTransferResult('ok'));
    },
    controlTransferIn: () => {
      return Promise.resolve(new USBInTransferResult('ok'));
    },
    claimInterface: (): Promise<void> => {
      return Promise.resolve();
    },
    releaseInterface: (): Promise<void> => {
      return Promise.resolve();
    },
    selectConfiguration(): Promise<void> {
      return Promise.resolve();
    },
  };
}

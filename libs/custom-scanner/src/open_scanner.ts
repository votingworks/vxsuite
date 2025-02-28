import { assertDefined, err, ok, Result } from '@votingworks/basics';
import { findByIds, WebUSBDevice } from 'usb';
import { UsbChannel, UsbChannelOptions } from './usb_channel';
import { CustomA4Scanner } from './custom_a4_scanner';
import { debug as baseDebug } from './debug';
import { ErrorCode } from './types';
import { CustomScanner } from './types/custom_scanner';

const debug = baseDebug.extend('scanner');

/** Custom vendor identifier. */
export const VENDOR_ID = 0x0dd4;

/** Custom A4 Scanner product identifier */
export const PRODUCT_ID = 0x4103;

/**
 * Options for the Custom A4 scanner.
 */
export const CustomA4ScannerChannelOptions: UsbChannelOptions = {
  configurationValue: 1,
  interfaceNumber: 0,
  readEndpointNumber: 1,
  writeEndpointNumber: 2,
};

/**
 * Finds and connects to the scanner. If the result is `Ok`, the scanner is
 * connected and ready to use. You must call `disconnect` when you're done
 * with it.
 */
export async function openScanner(): Promise<Result<CustomScanner, ErrorCode>> {
  const legacyDevice = findByIds(VENDOR_ID, PRODUCT_ID);
  if (!legacyDevice) {
    debug('no device found');
    return err(ErrorCode.ScannerOffline);
  }

  try {
    debug('found device: %o', legacyDevice);
    legacyDevice.open();
    for (const iface of assertDefined(
      legacyDevice.interfaces,
      `Device::interfaces must be set after Device::open() succeeds`
    )) {
      if (
        iface.interfaceNumber === CustomA4ScannerChannelOptions.interfaceNumber
      ) {
        if (iface.isKernelDriverActive()) {
          debug('detaching kernel driver');
          iface.detachKernelDriver();
        }
        break;
      }
    }

    const customA4ScannerChannel = new UsbChannel(
      await WebUSBDevice.createInstance(legacyDevice),
      CustomA4ScannerChannelOptions
    );
    const connectResult = await customA4ScannerChannel.connect();

    if (connectResult.isErr()) {
      debug('connection error: %o', connectResult.err());
      return connectResult;
    }

    debug('connected to device');
    return ok(new CustomA4Scanner(customA4ScannerChannel));
  } catch (error) {
    debug('unexpected error: %o', error);
    return err(ErrorCode.OpenDeviceError);
  }
}

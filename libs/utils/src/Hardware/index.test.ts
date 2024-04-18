import { mockDevices, mockKiosk } from '@votingworks/test-utils';
import { getHardware } from '.';
import { KioskHardware } from './kiosk_hardware';
import {
  AccessibleControllerProductId,
  AccessibleControllerVendorId,
  isAccessibleController,
  FujitsuScannerVendorId,
  isBatchScanner,
  isPrecinctScanner,
  CustomScannerVendorId,
  CustomA4ScannerProductId,
} from './utils';

it('getHardware returns KioskHardware when window.kiosk is set', () => {
  try {
    window.kiosk = mockKiosk();
    const hardware = getHardware();
    expect(hardware).toBeInstanceOf(KioskHardware);
  } finally {
    window.kiosk = undefined;
  }
});

it('getHardware does not return KioskHardware when window.kiosk is not set', () => {
  expect(window.kiosk).toBeUndefined();
  const hardware = getHardware();
  expect(hardware).not.toBeInstanceOf(KioskHardware);
});

it('isAccessibleController does not match just any device', () => {
  expect(isAccessibleController(mockDevices())).toEqual(false);
});

it('isAccessibleController matches a device with the right vendor and product id', () => {
  expect(
    isAccessibleController(
      mockDevices({
        vendorId: AccessibleControllerVendorId,
        productId: AccessibleControllerProductId,
      })
    )
  ).toEqual(true);
});

it('isBatchScanner does not match just any device', () => {
  expect(isBatchScanner(mockDevices())).toEqual(false);
});

it('isBatchScanner matches a device with the right vendor and product id', () => {
  expect(
    isBatchScanner(
      mockDevices({
        vendorId: FujitsuScannerVendorId,
      })
    )
  ).toEqual(true);
});

it('isPrecinctScanner does not match just any device', () => {
  expect(isPrecinctScanner(mockDevices())).toEqual(false);
});

it('isPrecinctScanner matches a device with the right vendor and product id', () => {
  expect(
    isPrecinctScanner(
      mockDevices({
        vendorId: CustomScannerVendorId,
        productId: CustomA4ScannerProductId,
      })
    )
  ).toEqual(true);
});

import { fakeDevice, fakeKiosk } from '@votingworks/test-utils';
import { getHardware } from '.';
import { KioskHardware } from './kiosk_hardware';
import {
  AccessibleControllerProductId,
  AccessibleControllerVendorId,
  isAccessibleController,
  isCardReader,
  OmniKeyCardReaderDeviceName,
  OmniKeyCardReaderManufacturer,
  OmniKeyCardReaderProductId,
  OmniKeyCardReaderVendorId,
  FujitsuScannerVendorId,
  PlustekScannerVendorId,
  PlustekVtm300ScannerProductId,
  isBatchScanner,
  isPrecinctScanner,
} from './utils';

it('getHardware returns KioskHardware when window.kiosk is set', async () => {
  try {
    window.kiosk = fakeKiosk();
    const hardware = getHardware();
    expect(hardware).toBeInstanceOf(KioskHardware);
  } finally {
    window.kiosk = undefined;
  }
});

it('getHardware does not return KioskHardware when window.kiosk is not set', async () => {
  expect(window.kiosk).toBeUndefined();
  const hardware = getHardware();
  expect(hardware).not.toBeInstanceOf(KioskHardware);
});

it('isCardReader does not match just any device', () => {
  expect(isCardReader(fakeDevice())).toBe(false);
});

it('isCardReader matches a device with the right vendor ID and product ID', () => {
  expect(
    isCardReader(
      fakeDevice({
        vendorId: OmniKeyCardReaderVendorId,
        productId: OmniKeyCardReaderProductId,
      })
    )
  ).toBe(true);
});

it('isCardReader matches a device with the right product name and manufacturer (using spaces)', () => {
  expect(
    isCardReader(
      fakeDevice({
        deviceName: OmniKeyCardReaderDeviceName,
        manufacturer: OmniKeyCardReaderManufacturer,
      })
    )
  ).toBe(true);
});

it('isCardReader matches a device with the right product name and manufacturer (using underscores)', () => {
  expect(
    isCardReader(
      fakeDevice({
        deviceName: OmniKeyCardReaderDeviceName.replace(/ /g, '_'),
        manufacturer: OmniKeyCardReaderManufacturer.replace(/ /g, '_'),
      })
    )
  ).toBe(true);
});

it('isAccessibleController does not match just any device', () => {
  expect(isAccessibleController(fakeDevice())).toBe(false);
});

it('isAccessibleController matches a device with the right vendor and product id', () => {
  expect(
    isAccessibleController(
      fakeDevice({
        vendorId: AccessibleControllerVendorId,
        productId: AccessibleControllerProductId,
      })
    )
  ).toBe(true);
});

it('isBatchScanner does not match just any device', () => {
  expect(isBatchScanner(fakeDevice())).toBe(false);
});

it('isBatchScanner matches a device with the right vendor and product id', () => {
  expect(
    isBatchScanner(
      fakeDevice({
        vendorId: FujitsuScannerVendorId,
      })
    )
  ).toBe(true);
});

it('isPrecinctScanner does not match just any device', () => {
  expect(isPrecinctScanner(fakeDevice())).toBe(false);
});

it('isPrecinctScanner matches a device with the right vendor and product id', () => {
  expect(
    isPrecinctScanner(
      fakeDevice({
        vendorId: PlustekScannerVendorId,
        productId: PlustekVtm300ScannerProductId,
      })
    )
  ).toBe(true);
});

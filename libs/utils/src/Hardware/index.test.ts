import { fakeDevice, fakeKiosk } from '@votingworks/test-utils';
import {
  FujitsuScannerVendorId,
  getHardware,
  isFujitsuScanner,
  PlustekScannerVendorId,
  PlustekVTM300ScannerProductId,
} from '.';
import { KioskHardware } from './KioskHardware';
import {
  AccessibleControllerProductId,
  AccessibleControllerVendorId,
  isAccessibleController,
  isCardReader,
  isPlustekVTM300Scanner,
  OmniKeyCardReaderDeviceName,
  OmniKeyCardReaderManufacturer,
  OmniKeyCardReaderProductId,
  OmniKeyCardReaderVendorId,
} from './utils';

it('getHardware returns KioskHardware when window.kiosk is set', async () => {
  try {
    window.kiosk = fakeKiosk();
    const hardware = await getHardware();
    expect(hardware).toBeInstanceOf(KioskHardware);
  } finally {
    window.kiosk = undefined;
  }
});

it('getHardware does not return KioskHardware when window.kiosk is not set', async () => {
  expect(window.kiosk).toBeUndefined();
  const hardware = await getHardware();
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

it('isFujitsuScanner does not match just any device', () => {
  expect(isFujitsuScanner(fakeDevice())).toBe(false);
});

it('isFujitsuScanner matches a device with the right vendor and product id', () => {
  expect(
    isFujitsuScanner(
      fakeDevice({
        vendorId: FujitsuScannerVendorId,
      })
    )
  ).toBe(true);
});

it('isPlustekVTM300Scanner does not match just any device', () => {
  expect(isPlustekVTM300Scanner(fakeDevice())).toBe(false);
});

it('isFujitsuScanner matches a device with the right vendor and product id', () => {
  expect(
    isPlustekVTM300Scanner(
      fakeDevice({
        vendorId: PlustekScannerVendorId,
        productId: PlustekVTM300ScannerProductId,
      })
    )
  ).toBe(true);
});

export const AccessibleControllerVendorId = 0x0d8c;
export const AccessibleControllerProductId = 0x0170;

/**
 * Determines whether a device is the accessible controller.
 */
export function isAccessibleController(device: KioskBrowser.Device): boolean {
  return (
    device.vendorId === AccessibleControllerVendorId &&
    device.productId === AccessibleControllerProductId
  );
}

export const OmniKeyCardReaderDeviceName = 'OMNIKEY 3x21 Smart Card Reader';
export const OmniKeyCardReaderManufacturer = 'HID Global';
export const OmniKeyCardReaderVendorId = 0x076b;
export const OmniKeyCardReaderProductId = 0x3031;

export const LenovoBuiltInCardReaderVendorIds = [0x2ce3, 0x058f];
export const LenovoBuiltInCardReaderProductIds = [0x9563, 0x9540];

/**
 * Determines whether a device is the card reader.
 */
export function isCardReader(device: KioskBrowser.Device): boolean {
  const isOmniKeyReader =
    (device.manufacturer.replace(/_/g, ' ') === OmniKeyCardReaderManufacturer &&
      device.deviceName.replace(/_/g, ' ') === OmniKeyCardReaderDeviceName) ||
    (device.vendorId === OmniKeyCardReaderVendorId &&
      device.productId === OmniKeyCardReaderProductId);
  const isBuiltInReader =
    LenovoBuiltInCardReaderVendorIds.includes(device.vendorId) &&
    LenovoBuiltInCardReaderProductIds.includes(device.productId);
  return isOmniKeyReader || isBuiltInReader;
}

export const BrotherHll5100DnVendorId = 0x04f9;
export const BrotherHll5100DnProductId = 0x007f;

/**
 * Determines whether a device is a supported printer.
 */
export function isPrinter(device: KioskBrowser.Device): boolean {
  return (
    device.vendorId === BrotherHll5100DnVendorId &&
    device.productId === BrotherHll5100DnProductId
  );
}

export const FujitsuScannerVendorId = 0x4c5;
export const FujitsuFi7160ScannerProductId = 0x132e;
export function isBatchScanner(device: KioskBrowser.Device): boolean {
  return device.vendorId === FujitsuScannerVendorId;
}

export const CustomScannerVendorId = 0x0dd4;
export const CustomA4ScannerProductId = 0x4103;
export function isPrecinctScanner(device: KioskBrowser.Device): boolean {
  return (
    device.vendorId === CustomScannerVendorId &&
    device.productId === CustomA4ScannerProductId
  );
}

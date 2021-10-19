export const AccessibleControllerVendorId = 0x0d8c;
export const AccessibleControllerProductId = 0x0170;

export const BrotherHLL5100DNVendorId = 0x04f9;
export const BrotherHLL5100DNProductId = 0x007f;

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

/**
 * Determines whether a device is the card reader.
 */
export function isCardReader(device: KioskBrowser.Device): boolean {
  return (
    (device.manufacturer.replace(/_/g, ' ') === OmniKeyCardReaderManufacturer &&
      device.deviceName.replace(/_/g, ' ') === OmniKeyCardReaderDeviceName) ||
    (device.vendorId === OmniKeyCardReaderVendorId &&
      device.productId === OmniKeyCardReaderProductId)
  );
}

/**
 * Determines whether a device is a supported printer.
 */
export function isPrinter(device: KioskBrowser.Device): boolean {
  return (
    device.vendorId === BrotherHLL5100DNVendorId &&
    device.productId === BrotherHLL5100DNProductId
  );
}

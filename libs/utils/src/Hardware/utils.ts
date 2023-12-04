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

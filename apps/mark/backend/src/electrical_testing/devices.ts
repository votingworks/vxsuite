import * as hid from 'node-hid';

// Honeywell CM4680SR (AKA Metrologic Instruments CM4680SR):
const BARCODE_SCANNER_VENDOR_ID = 0x0c2e;
const BARCODE_SCANNER_PRODUCT_ID = 0x10d3;

/**
 * Check if the barcode scanner hardware is connected by looking for the USB device.
 */
export function isBarcodeDeviceConnected(): boolean {
  const devices = hid.devices(
    BARCODE_SCANNER_VENDOR_ID,
    BARCODE_SCANNER_PRODUCT_ID
  );
  return devices.length > 0;
}

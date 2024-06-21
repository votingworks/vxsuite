import { PrinterConfig } from '@votingworks/types';

export const BROTHER_THERMAL_PRINTER_CONFIG: PrinterConfig = {
  label: 'Brother PJ-822',
  vendorId: 1273,
  productId: 8418,
  baseDeviceUri: 'usb://Brother/PJ-822',
  ppd: 'brother_pj822_printer_en.ppd',
  supportsIpp: false,
};

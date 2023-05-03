/* istanbul ignore file - no logic in this file */
export * from './interpret';
export * from './types';
export {
  detect as detectQrCode,
  detectInFilePath as detectQrcodeInFilePath,
  getSearchAreas as getQrCodeSearchAreas,
} from './utils/qrcode';
export type { QrCodePageResult } from './utils/qrcode';

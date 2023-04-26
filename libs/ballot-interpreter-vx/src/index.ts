/* istanbul ignore file - there should not be any logic to test */
export * from './types';
export {
  detect as detectQrCode,
  detectInFilePath as detectQrcodeInFilePath,
} from './utils/qrcode';
export { normalizeSheetOutput } from './sheet';
export type { QrCodePageResult } from './utils/qrcode';

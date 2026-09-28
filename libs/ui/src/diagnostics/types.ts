import type { EnumValues } from '@votingworks/basics';

/** String shown to system admins only */
export const DiagnosticSectionTitle = {
  PaperHandler: 'Printer-Scanner',
  AccessibleController: 'Accessible Controller',
  PatInput: 'PAT Input',
  HeadphoneInput: 'Headphone Input',
  FrontHeadphoneInput: 'Front Headphone Input',
  BarcodeReader: 'Barcode Reader',
  Ups: 'Uninterruptible Power Supply',
  Printer: 'Printer',
  SystemAudio: 'System Audio',
} as const;

/** String shown to system admins only */
export type DiagnosticSectionTitle = EnumValues<typeof DiagnosticSectionTitle>;

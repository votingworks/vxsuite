import { Buffer } from 'buffer';

export interface DetectQrCodeResult {
  data: Buffer;
  position: 'top' | 'bottom';
  detector: string;
}

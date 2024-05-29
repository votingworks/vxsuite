import { Buffer } from 'buffer';

export interface DetectedQrCode {
  data: Buffer;
  position: 'top' | 'bottom';
  detector: string;
}

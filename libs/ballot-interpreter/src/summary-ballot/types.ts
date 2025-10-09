import { Buffer } from 'node:buffer';

export interface DetectedQrCode {
  data: Buffer;
  position: 'top' | 'bottom';
  detector: string;
}

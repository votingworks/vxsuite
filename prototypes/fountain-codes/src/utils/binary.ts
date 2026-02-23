import { EncodingMode, FrameHeader } from '../fountain/types';

/**
 * QR Frame binary format:
 * [0]      mode         (uint8: 0=fountain, 1=round-robin)
 * [1..3)   k            (uint16 BE)
 * [3..5)   blockSize    (uint16 BE)
 * [5..9)   dataLength   (uint32 BE)
 * [9..17)  dataHash     (8 bytes, first 8 of SHA-256)
 * [17..21) seed         (uint32 BE)
 * [21..N)  symbolData   (blockSize bytes)
 *
 * Base64-encoded for QR display.
 */

export const HEADER_SIZE = 21;

const MODE_TO_BYTE: Record<EncodingMode, number> = {
  fountain: 0,
  'round-robin': 1,
};
const BYTE_TO_MODE: Record<number, EncodingMode> = {
  0: 'fountain',
  1: 'round-robin',
};

/**
 * QR byte mode capacity by error correction level (version 40, 177x177 modules).
 */
export const QR_CAPACITY: Record<string, number> = { L: 2953, M: 2331 };

/**
 * Max block size that fits in a single QR code at the given level,
 * accounting for header + base64 overhead.
 */
export function maxBlockSizeForLevel(level: string): number {
  const capacity = QR_CAPACITY[level] ?? QR_CAPACITY['M'];
  return Math.floor(capacity / 4) * 3 - HEADER_SIZE;
}

export function encodeFrame(
  header: FrameHeader,
  symbolData: Uint8Array
): string {
  const buffer = new ArrayBuffer(HEADER_SIZE + symbolData.length);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  view.setUint8(0, MODE_TO_BYTE[header.mode]);
  view.setUint16(1, header.k, false);
  view.setUint16(3, header.blockSize, false);
  view.setUint32(5, header.dataLength, false);
  bytes.set(header.dataHash.slice(0, 8), 9);
  view.setUint32(17, header.seed, false);
  bytes.set(symbolData, HEADER_SIZE);

  return uint8ArrayToBase64(bytes);
}

export function decodeFrame(
  input: Uint8Array | string
): { header: FrameHeader; symbolData: Uint8Array } | null {
  let bytes: Uint8Array;
  try {
    if (typeof input === 'string') {
      bytes = base64ToUint8Array(input);
    } else {
      const asString = new TextDecoder('ascii').decode(input);
      bytes = base64ToUint8Array(asString);
    }
  } catch {
    return null;
  }

  if (bytes.length < HEADER_SIZE) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const modeByte = view.getUint8(0);
  const mode = BYTE_TO_MODE[modeByte];
  if (!mode) return null;

  const k = view.getUint16(1, false);
  const blockSize = view.getUint16(3, false);
  const dataLength = view.getUint32(5, false);
  const dataHash = bytes.slice(9, 17);
  const seed = view.getUint32(17, false);

  if (bytes.length < HEADER_SIZE + blockSize) return null;

  const symbolData = bytes.slice(HEADER_SIZE, HEADER_SIZE + blockSize);

  return {
    header: { mode, k, blockSize, dataLength, dataHash, seed },
    symbolData,
  };
}

export function frameSizeBase64(blockSize: number): number {
  return Math.ceil((HEADER_SIZE + blockSize) / 3) * 4;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

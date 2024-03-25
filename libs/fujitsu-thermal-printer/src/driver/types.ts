export interface UncompressedBitImage {
  height: number;
  data: Uint8Array;
  compressed: false;
}

export interface CompressedBitImage {
  height: number;
  data: Int8Array;
  compressed: true;
}

export type BitImage = UncompressedBitImage | CompressedBitImage;

/** Encoding mode */
export type EncodingMode = 'fountain' | 'round-robin';

/** A single encoded symbol */
export interface EncodedSymbol {
  readonly seed: number;
  readonly data: Uint8Array;
}

/** Configuration for the LT encoder */
export interface EncoderConfig {
  readonly blockSize: number;
  readonly c: number;
  readonly delta: number;
}

export const DEFAULT_ENCODER_CONFIG: EncoderConfig = {
  blockSize: 400,
  c: 0.2,
  delta: 0.2,
};

/** State of the LT decoder during belief propagation */
export interface DecoderState {
  readonly k: number;
  readonly blockSize: number;
  readonly decoded: (Uint8Array | null)[];
  numDecoded: number;
  readonly symbols: Array<{
    blockIndices: number[];
    data: Uint8Array;
  }>;
}

/** Header embedded in every QR frame */
export interface FrameHeader {
  readonly mode: EncodingMode;
  readonly k: number;
  readonly blockSize: number;
  readonly dataLength: number;
  readonly dataHash: Uint8Array;
  readonly seed: number;
}

/** Common encoder interface for both modes */
export interface SymbolEncoder {
  readonly k: number;
  readonly blockSize: number;
  readonly dataLength: number;
  readonly dataHash: Uint8Array;
  nextSymbol(): EncodedSymbol;
}

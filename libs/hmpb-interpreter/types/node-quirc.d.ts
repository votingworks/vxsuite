declare module 'node-quirc' {
  export const constants: {
    // QR-code versions.
    VERSION_MIN: 1
    VERSION_MAX: 40
    // QR-code ECC levels.
    ECC_LEVEL_M: 'M'
    ECC_LEVEL_L: 'L'
    ECC_LEVEL_H: 'H'
    ECC_LEVEL_Q: 'Q'
    // QR-code encoding modes.
    MODE_NUMERIC: 'NUMERIC'
    MODE_ALNUM: 'ALNUM'
    MODE_BYTE: 'BYTE'
    MODE_KANJI: 'KANJI'
  }

  interface QRCode {
    version: number
    // eslint-disable-next-line camelcase
    ecc_level:
      | typeof constants['ECC_LEVEL_M']
      | typeof constants['ECC_LEVEL_L']
      | typeof constants['ECC_LEVEL_H']
      | typeof constants['ECC_LEVEL_Q']
    mask: number
    mode:
      | typeof constants['MODE_NUMERIC']
      | typeof constants['MODE_ALNUM']
      | typeof constants['MODE_BYTE']
      | typeof constants['MODE_KANJI']
    data: Buffer
  }

  // eslint-disable-next-line import/export
  export function decode(img: Buffer): Promise<QRCode[]>
  // eslint-disable-next-line import/export
  export function decode(
    img: Buffer,
    callback: (err: Error, results: QRCode[]) => void
  ): Promise<QRCode[]>
}

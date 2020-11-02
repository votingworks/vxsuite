import { Uint8Size } from './types'
import { sizeof } from './utils'

/**
 * Encoding to be used for encoding and decoding text.
 *
 * @see `BitWriter#writeString`
 * @see `BitReader#readString`
 */
export interface Encoding {
  readonly bitsPerElement: number
  encode(string: string): Uint8Array
  decode(data: Uint8Array): string
}

/**
 * Default encoding to use for `BitReader` and `BitWriter`.
 */
export const UTF8Encoding: Encoding = {
  bitsPerElement: Uint8Size,

  /**
   * Encodes a string as UTF-8 code points.
   */
  encode(string: string): Uint8Array {
    return new TextEncoder().encode(string)
  },

  /**
   * Decodes a string from UTF-8 code points.
   */
  decode(data: Uint8Array): string {
    return new TextDecoder('utf-8').decode(data)
  },
}

/**
 * Encoding based on a string of representable characters. Each character is
 * represented by its index within the string, and any other characters are
 * unrepresentable.
 *
 * @example
 *
 * const encoding = new CustomEncoding('0123456789')
 * encoding.encode('23')  // Uint8Array [2, 3]
 */
export class CustomEncoding implements Encoding {
  private readonly chars: string

  /**
   * The maximum character code representable by this class.
   */
  public static MAX_CODE = (1 << (Uint8Array.BYTES_PER_ELEMENT * Uint8Size)) - 1
  public readonly bitsPerElement: number

  /**
   * @param chars a string of representable characters without duplicates
   */
  public constructor(chars: string) {
    CustomEncoding.validateChars(chars)
    this.chars = chars
    this.bitsPerElement = sizeof(chars.length - 1)
  }

  private static validateChars(chars: string): void {
    if (chars.length > CustomEncoding.MAX_CODE + 1) {
      throw new Error(
        `character set too large, has ${chars.length} but only ${
          CustomEncoding.MAX_CODE + 1
        } are allowed`
      )
    }

    for (let i = 0; i < chars.length - 1; i += 1) {
      const duplicateIndex = chars.indexOf(chars.charAt(i), i + 1)
      if (duplicateIndex > 0) {
        throw new Error(
          `duplicate character found in character set:\n- set: ${JSON.stringify(
            chars
          )}\n- duplicates: ${i} & ${duplicateIndex}`
        )
      }
    }
  }

  /**
   * Encodes `string` as a series of character codes based on the character set
   * provided to the constructor.
   *
   * @param string a string containing only representable characters
   */
  public encode(string: string): Uint8Array {
    const codes = new Uint8Array(string.length)

    for (let i = 0; i < string.length; i += 1) {
      const char = string.charAt(i)
      const code = this.chars.indexOf(char)

      if (code < 0) {
        throw new Error(
          `cannot encode unrepresentable character: ${JSON.stringify(
            char
          )} (allowed: ${JSON.stringify(this.chars)})`
        )
      }

      codes.set([code], i)
    }

    return codes
  }

  /**
   * Builds a string by decoding a character from each character code based on
   * the character set provided to the constructor.
   *
   * @param data a series of character codes representing characters in this encoding
   */
  public decode(data: Uint8Array): string {
    return Array.from(data)
      .map((code, i) => {
        if (code >= this.chars.length) {
          throw new Error(`character code out of bounds at index ${i}: ${code}`)
        }

        return this.chars[code]
      })
      .join('')
  }
}

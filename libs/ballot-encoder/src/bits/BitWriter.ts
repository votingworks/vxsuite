import BitCursor from './BitCursor'
import { Uint8, Uint1, Uint8Size } from './types'
import { sizeof, makeMasks, toUint8 } from './utils'
import { UTF8Encoding, Encoding } from './encoding'

/**
 * Writes structured data into a `Uint8Array`. Data is written in little-endian
 * order.
 */
export default class BitWriter {
  private data = new Uint8Array()
  private cursor = new BitCursor()
  private nextByte: Uint8 = 0b00000000

  /**
   * Append `byte` to the internal buffer.
   */
  private appendByte(byte: Uint8): void {
    const nextData = new Uint8Array(this.data.length + 1)
    nextData.set(this.data)
    nextData[this.data.length] = byte
    this.data = nextData
  }

  /**
   * Writes bits.
   */
  public writeUint1(...uint1s: Uint1[]): this {
    for (const uint1 of uint1s) {
      const mask = this.cursor.mask(uint1)
      this.nextByte |= mask
      this.cursor.next()

      if (this.cursor.isByteStart) {
        this.appendByte(toUint8(this.nextByte))
        this.nextByte = 0b00000000
      }
    }

    return this
  }

  /**
   * Writes `1` if given `true`, `0` otherwise.
   */
  public writeBoolean(...booleans: boolean[]): this {
    for (const boolean of booleans) {
      this.writeUint1(boolean ? 1 : 0)
    }

    return this
  }

  /**
   * Writes data from a `Uint8` by writing 8 bits.
   */
  public writeUint8(...uint8s: Uint8[]): this {
    for (const uint8 of uint8s) {
      this.writeUint(uint8, { size: Uint8Size })
    }
    return this
  }

  /**
   * Writes an unsigned integer as a series of bits. There are two ways to
   * control the number of bytes `number` takes: provide a `max` value or
   * provide a `size`. If `max` is provided, then however many bytes would be
   * required to write `max` will be used to write `number`. If `size` is
   * provided, then that is how many bytes will be used.
   *
   * @example
   *
   * bits.writeUint(23, { max: 30 })  // writes `10111`
   * bits.writeUint(99, { size: 8 })  // writes `01100011`
   */
  public writeUint(number: number, { max }: { max: number }): this
  public writeUint(number: number, { size }: { size: number }): this
  public writeUint(
    number: number,
    { max, size }: { max?: number; size?: number }
  ): this {
    if (typeof max !== 'undefined' && typeof size !== 'undefined') {
      throw new Error("cannot specify both 'max' and 'size' options")
    }

    if (typeof max !== 'undefined') {
      if (number > max) {
        throw new Error(`overflow: ${number} must be less than ${max}`)
      }

      return this.writeUint(number, { size: sizeof(max) })
    }

    if (typeof size === 'undefined') {
      throw new Error('size cannot be undefined')
    }

    if (number >= 1 << size) {
      throw new Error(`overflow: ${number} cannot fit in ${size} bits`)
    }

    if (size === Uint8Size && this.cursor.isByteStart) {
      this.appendByte(toUint8(number))
      this.cursor.advance(Uint8Size)
    } else {
      for (const mask of makeMasks(size)) {
        this.writeUint1((number & mask) === 0 ? 0 : 1)
      }
    }

    return this
  }

  /**
   * Writes string data with an encoding and maximum length. By default, the
   * encoding used will be UTF-8. If your string has a restricted character set,
   * you can use your own `CustomEncoding` to read and write the string more
   * compactly than you otherwise would be able to.
   *
   * It is important to remember that the `encoding` and `maxLength` options
   * must be the same for `readString` and `writeString` calls, otherwise
   * reading the string will very likely fail or be corrupt.
   *
   * @example
   *
   * bits.writeString('hi') // uses utf-8, writes '0110100001101001'
   *
   * const encoding = new CustomEncoding('hi')
   * bits.writeString('hi') // uses custom encoding, writes '01'
   */
  public writeString(
    string: string,
    {
      encoding = UTF8Encoding,
      maxLength = (1 << Uint8Size) - 1,
      includeLength = true,
    }: { encoding?: Encoding; maxLength?: number; includeLength?: boolean } = {}
  ): this {
    const codes = encoding.encode(string)

    // write length
    if (includeLength) {
      if (codes.length > maxLength) {
        throw new Error(
          `overflow: cannot write a string longer than max length: ${string.length} > ${maxLength}`
        )
      }

      this.writeUint(codes.length, { max: maxLength })
    }

    // write content
    for (const code of codes) {
      this.writeUint(code, { size: encoding.bitsPerElement })
    }

    return this
  }

  /**
   * Calls back with this `BitWriter` to make chaining easier.
   *
   * @example
   *
   * return new BitWriter()
   *   .writeBoolean(true)
   *   .with(writer => encodeSomething(writer))
   *   .writeBoolean(false)
   */
  public with(callback: (writer: this) => void): this {
    callback(this)
    return this
  }

  /**
   * Converts the data written to this `BitWriter` to a `Uint8Array`.
   */
  public toUint8Array(): Uint8Array {
    const pendingByte = this.getPendingByte()

    if (typeof pendingByte === 'undefined') {
      return Uint8Array.from(this.data)
    } else {
      const result = new Uint8Array(this.data.length + 1)
      result.set(this.data)
      result[this.data.length] = pendingByte
      return result
    }
  }

  /**
   * If there's a byte that is not yet full, get it.
   */
  private getPendingByte(): Uint8 | undefined {
    if (this.cursor.isByteStart) {
      return undefined
    }
    return this.nextByte
  }

  public debug(label?: string): this {
    if (label) {
      console.log(label)
    }
    console.log(
      inGroupsOf(
        8,
        inGroupsOf(
          Uint8Size,
          Array.from(this.toUint8Array())
            .map((n) => n.toString(2).padStart(Uint8Size, '0'))
            .join('')
            .slice(0, this.cursor.combinedBitOffset)
            .split('')
        )
      )
        .map((row) => row.map((cell) => cell.join('')).join(' '))
        .join('\n')
    )
    return this
  }
}

function inGroupsOf<T>(count: number, array: T[]): T[][] {
  const result: T[][] = []

  for (let i = 0; i < array.length; i += count) {
    result.push(array.slice(i, i + count))
  }

  return result
}

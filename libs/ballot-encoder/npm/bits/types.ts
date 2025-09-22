/**
 * Possible indexes for a bit offset in a `Uint8` value.
 */
export type Uint8Index = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Possible indexes for a bit offset in a `Uint1` value.
 */
export type Uint1 = 0 | 1;

/**
 * Possible values for a `Uint8` value.
 */
export type Uint8 =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24
  | 25
  | 26
  | 27
  | 28
  | 29
  | 30
  | 31
  | 32
  | 33
  | 34
  | 35
  | 36
  | 37
  | 38
  | 39
  | 40
  | 41
  | 42
  | 43
  | 44
  | 45
  | 46
  | 47
  | 48
  | 49
  | 50
  | 51
  | 52
  | 53
  | 54
  | 55
  | 56
  | 57
  | 58
  | 59
  | 60
  | 61
  | 62
  | 63
  | 64
  | 65
  | 66
  | 67
  | 68
  | 69
  | 70
  | 71
  | 72
  | 73
  | 74
  | 75
  | 76
  | 77
  | 78
  | 79
  | 80
  | 81
  | 82
  | 83
  | 84
  | 85
  | 86
  | 87
  | 88
  | 89
  | 90
  | 91
  | 92
  | 93
  | 94
  | 95
  | 96
  | 97
  | 98
  | 99
  | 100
  | 101
  | 102
  | 103
  | 104
  | 105
  | 106
  | 107
  | 108
  | 109
  | 110
  | 111
  | 112
  | 113
  | 114
  | 115
  | 116
  | 117
  | 118
  | 119
  | 120
  | 121
  | 122
  | 123
  | 124
  | 125
  | 126
  | 127
  | 128
  | 129
  | 130
  | 131
  | 132
  | 133
  | 134
  | 135
  | 136
  | 137
  | 138
  | 139
  | 140
  | 141
  | 142
  | 143
  | 144
  | 145
  | 146
  | 147
  | 148
  | 149
  | 150
  | 151
  | 152
  | 153
  | 154
  | 155
  | 156
  | 157
  | 158
  | 159
  | 160
  | 161
  | 162
  | 163
  | 164
  | 165
  | 166
  | 167
  | 168
  | 169
  | 170
  | 171
  | 172
  | 173
  | 174
  | 175
  | 176
  | 177
  | 178
  | 179
  | 180
  | 181
  | 182
  | 183
  | 184
  | 185
  | 186
  | 187
  | 188
  | 189
  | 190
  | 191
  | 192
  | 193
  | 194
  | 195
  | 196
  | 197
  | 198
  | 199
  | 200
  | 201
  | 202
  | 203
  | 204
  | 205
  | 206
  | 207
  | 208
  | 209
  | 210
  | 211
  | 212
  | 213
  | 214
  | 215
  | 216
  | 217
  | 218
  | 219
  | 220
  | 221
  | 222
  | 223
  | 224
  | 225
  | 226
  | 227
  | 228
  | 229
  | 230
  | 231
  | 232
  | 233
  | 234
  | 235
  | 236
  | 237
  | 238
  | 239
  | 240
  | 241
  | 242
  | 243
  | 244
  | 245
  | 246
  | 247
  | 248
  | 249
  | 250
  | 251
  | 252
  | 253
  | 254
  | 255;

/**
 * Number of bits in a `Uint8` value.
 */
export const Uint8Size = 8;

/**
 * Options when calling methods for writing strings to a `BitWriter`.
 */
export type WriteStringOptions =
  | { writeLength: false; fixedLength: number }
  | { writeLength: true; maxLength: number }

/**
 * Options when calling methods for reading strings to a `BitReader`.
 */
export type ReadStringOptions =
  | { readLength: false; fixedLength: number }
  | { readLength: true; maxLength: number }

/**
 * Any object that collects writes into a `Uint8Array`.
 */
export interface BitWriter {
  writeUint1(...uint1s: Uint1[]): this;
  writeBoolean(...booleans: boolean[]): this;
  writeUint8(...uint8s: Uint8[]): this;

  /**
   * Writes an unsigned integer as a series of bits. `max` determines the number
   * of bits to use to write `number`, i.e. as many as `max` would require.
   *
   * @example
   *
   * bits.writeUint(23, { max: 30 })  // writes `10111`
   */
  writeUint(number: number, { max }: { max: number; }): this;

  /**
   * Writes an unsigned integer as a series of bits. `size` determines the
   * number of bits to use to write `number`, so `number` must be able to fit.
   *
   * @example
   *
   * bits.writeUint(99, { size: 8 })  // writes `01100011`
   */
  writeUint(number: number, { size }: { size: number; }): this;

  /**
   * Writes a string encoded as UTF-8, optionally including the string's
   * length. Only omit the string length if the decoder will know how many
   * bytes to read.
   */
  writeUtf8String(string: string, options: WriteStringOptions): this;

  /**
   * Writes a string encoded using the characters available in write-ins,
   * optionally including the string's length. Only omit the string length if
   * the decoder will know how many bytes to read.
   */
  writeWriteInString(string: string, options: WriteStringOptions): this;

  /**
   * Writes a string encoded using hex encoding, optionally including the
   * string's length. Only omit the string length if the decoder will know how
   * many bytes to read.
   */
  writeHexString(string: string, options: WriteStringOptions): this;

  /**
   * Helper function, mostly for testing and easier chaining.
   */
  with(callback: (writer: this) => void): this;

  /**
   * Returns the written data as a `Uint8Array`, padding the bits until they
   * are byte-aligned.
   */
  toUint8Array(): Uint8Array;
}

/**
 * Any objects that reads structured data from a sequence of bits.
 */
export interface BitReader {
  /**
   * Reads a Uint1.
   */
  readUint1(): Uint1

  /**
   * Reads a number by reading 8 bits.
   */
  readUint8(): Uint8;

  /**
   * Reads a boolean by reading a bit and returning whether the bit was set.
   */
  readBoolean(): boolean

  /**
   * Reads a unsigned integer as a series of bits. There are two ways to control
   * the number of bytes `number` takes: provide a `max` value or provide a
   * `size`. If `max` is provided, then however many bytes would be required to
   * write `max` will be used to write `number`. If `size` is provided, then
   * that is how many bytes will be used.
   *
   * @example
   *
   * // contains 16 bits
   * const bits = new BitReader(Uint8Array.of(0xff, 0x0f))
   *
   * bits.readUint({ max: 0x0f })  // reads first 4 bits: 0x0f
   * bits.readUint({ size: 8 })    // reads next 8 bits:  0xf0
   * bits.readUint({ size: 4 })    // reads last 4 bits:  0x0f
   */
  readUint({ max }: { max: number }): number;
  readUint({ size }: { size: number }): number;

  /**
   * Reads a string, either with a known length or by reading a length up to a
   * given maximum. By default, the encoding used will be UTF-8. If your string
   * has a restricted character set, you can use your own `CustomEncoding` to
   * read and write the string more compactly than you otherwise would be able
   * to.
   *
   * It is important to remember that the options must be the same for
   * `readUtf8String` and `writeUtf8String` calls, otherwise reading the string
   * will very likely fail or be corrupt.
   *
   * @example
   *
   *                                  // length  'h'  'i'
   *                                  //      ↓   ↓    ↓
   * const bits = new BitReader(Uint8Array.of(2, 104, 105))
   * bits.readUtf8String({ includeLength: false }) // "hi"
   */
  readUtf8String(options: ReadStringOptions): string;

  readWriteInString(options: ReadStringOptions): string;
  readHexString(options: ReadStringOptions): string;

  /**
   * Skips uint values if they match the next values to be read.
   *
   * @returns true if the uints matched and were skipped, false otherwise
   */
  skipUint(expected: number, { max }: { max: number }): boolean;
  skipUint(expected: number, { size }: { size: number }): boolean;
  skipUint(expected: number[], { max }: { max: number }): boolean;
  skipUint(expected: number[], { size }: { size: number }): boolean;

  /**
   * Skips N bits if they match the next N bits that would be read.
   *
   * @returns true if the bits matched and were skipped, false otherwise
   */
  skipUint1(...uint1s: number[]): boolean

  /**
   * Skips N bytes if they match the next N bytes that would be read.
   *
   * @returns true if the bytes matched and were skipped, false otherwise
   */
  skipUint8(...uint8s: number[]): boolean

  /**
   * Determines whether there is any more data to read. If the result is
   * `false`, then any call to read data will throw an exception.
   */
  canRead(size?: number): boolean
}

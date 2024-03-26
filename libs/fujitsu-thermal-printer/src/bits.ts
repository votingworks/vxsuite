import { assert } from '@votingworks/basics';

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
export const UINT_8_SIZE = 8;

/**
 * Number of bytes in a `Uint32` value
 */
export const BYTES_PER_UINT_32 = 4;

/**
 * Maximum value of a `Uint8`
 */
export const UINT_8_MAX: Uint8 = 255;

/**
 * Bitmask for the most significant bit in Uint8
 */
export const UINT_8_MOST_SIGNIFICANT_BIT_MASK: Uint8 = 128;

/**
 * Maximum value of a `Uint16`
 */
export const UINT_16_MAX = 65535;

/**
 * Binary array for debugging
 */
type BinaryStringRepresentation = '0' | '1';
export type BinaryArray = [
  BinaryStringRepresentation,
  BinaryStringRepresentation,
  BinaryStringRepresentation,
  BinaryStringRepresentation,
  BinaryStringRepresentation,
  BinaryStringRepresentation,
  BinaryStringRepresentation,
  BinaryStringRepresentation,
];

export function getZeroBinaryArray(): BinaryArray {
  return ['0', '0', '0', '0', '0', '0', '0', '0'];
}

/**
 * Array of booleans representing the bits in a byte. Although unenforceable,
 * use to represent MSB-first to mirror how we would represent binary.
 */
export type BitArray = [
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
];

export function getZeroBitArray(): BitArray {
  return [false, false, false, false, false, false, false, false];
}

export function Uint8ToBitArray(value: Uint8): BitArray {
  let shiftingValue: number = value;

  const bitArray = getZeroBitArray();
  for (let i = 0; i < UINT_8_SIZE; i += 1) {
    bitArray[i] = Boolean(shiftingValue & UINT_8_MOST_SIGNIFICANT_BIT_MASK);
    shiftingValue <<= 1;
  }
  return bitArray;
}

export function Uint8ToBinaryArray(value: Uint8): BinaryArray {
  let shiftingValue: number = value;

  const bitArray = getZeroBinaryArray();
  for (let i = 0; i < UINT_8_SIZE; i += 1) {
    const booleanValue = shiftingValue & UINT_8_MOST_SIGNIFICANT_BIT_MASK;
    bitArray[i] = booleanValue ? '1' : '0';
    shiftingValue <<= 1;
  }
  return bitArray;
}

const BIT_MULTIPLIERS = [128, 64, 32, 16, 8, 4, 2, 1];

export function bitArrayToByte(bits: BitArray): Uint8 {
  if (bits.length !== 8) {
    throw new Error('invalid bit array');
  }

  let result = 0;
  for (const [index, bit] of bits.entries()) {
    const multiplier = BIT_MULTIPLIERS[index];
    assert(multiplier !== undefined);
    if (bit) result += multiplier;
  }

  return result as Uint8;
}

/**
 * Just using an alias for readability because we don't have a great way to represent this in typescript.
 */
export type Uint16 = number;

export function numberIsInRangeInclusive(
  num: number,
  lowerBound: number,
  upperBound: number
): boolean {
  return num >= lowerBound && num <= upperBound;
}

export function assertNumberIsInRangeInclusive(
  num: number,
  lowerBound: number,
  upperBound: number
): void {
  if (!numberIsInRangeInclusive(num, lowerBound, upperBound)) {
    throw new Error(
      `${num} is not within range [${lowerBound}, ${upperBound}]`
    );
  }
}

export function isUint8(num: number): num is Uint8 {
  return numberIsInRangeInclusive(num, 0, UINT_8_MAX);
}

export function assertUint8(num: number): asserts num is Uint8 {
  assertNumberIsInRangeInclusive(num, 0, UINT_8_MAX);
}

export function assertUint16(num: number): asserts num is Uint16 {
  assertNumberIsInRangeInclusive(num, 0, UINT_16_MAX);
}

export function Uint16toUint8(value: Uint16): [MSB: Uint8, LSB: Uint8] {
  if (value < 0 || value > UINT_16_MAX) {
    throw new Error('invalid Uint16');
  }

  const data = new DataView(new ArrayBuffer(2));

  data.setUint16(0, value);
  return [data.getUint8(0) as Uint8, data.getUint8(1) as Uint8];
}

const UINT_32_MAX = 4294967295;

export function Uint32toUint8(value: number): [Uint8, Uint8, Uint8, Uint8] {
  if (value < 0 || value > UINT_32_MAX) {
    throw new Error('invalid Uint32');
  }

  const data = new DataView(new ArrayBuffer(4));

  data.setUint32(0, value);
  return [
    data.getUint8(0) as Uint8,
    data.getUint8(1) as Uint8,
    data.getUint8(2) as Uint8,
    data.getUint8(3) as Uint8,
  ];
}

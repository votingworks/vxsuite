import { Uint8, Uint8ToBitArray, Uint8ToBinaryArray } from './bits';

const bitArrayTests = [
  {
    // Lower bound
    value: 0x00,
    expectedBitArray: [false, false, false, false, false, false, false, false],
  },
  {
    // Upper bound
    value: 0xff,
    expectedBitArray: [true, true, true, true, true, true, true, true],
  },
  {
    // Non-palindrome value
    value: 0x84,
    expectedBitArray: [true, false, false, false, false, true, false, false],
  },
];
test.each(bitArrayTests)(
  `Uint8ToBitArray converts $value to bit array`,
  ({ value, expectedBitArray }) => {
    expect(Uint8ToBitArray(value as Uint8)).toEqual(expectedBitArray);
  }
);

const binaryArrayTests = [
  {
    // Lower bound
    value: 0x00,
    expectedBinaryArray: ['0', '0', '0', '0', '0', '0', '0', '0'],
  },
  {
    // Upper bound
    value: 0xff,
    expectedBinaryArray: ['1', '1', '1', '1', '1', '1', '1', '1'],
  },
  {
    // Non-palindrome value
    value: 0x84,
    expectedBinaryArray: ['1', '0', '0', '0', '0', '1', '0', '0'],
  },
];
test.each(binaryArrayTests)(
  `Uint8ToBinaryArray converts $value to an array of strings of '1' and '0'`,
  ({ value, expectedBinaryArray }) => {
    expect(Uint8ToBinaryArray(value as Uint8)).toEqual(expectedBinaryArray);
  }
);

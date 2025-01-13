/* eslint-disable vx/gts-no-array-constructor */
import { compressBitImage, packBitsCompression } from './printing';

test('packBitsCompression', () => {
  const testCases: Array<{ uncompressed: number[]; compressed: number[] }> = [
    {
      uncompressed: [3, 3, 3],
      compressed: [-2, 3],
    },
    {
      uncompressed: [3, 3, 3, 3, 3],
      compressed: [-4, 3],
    },
    {
      uncompressed: [1, 2, 3],
      compressed: [2, 1, 2, 3],
    },
    {
      uncompressed: [1, 2, 3, 4, 5],
      compressed: [4, 1, 2, 3, 4, 5],
    },
    {
      uncompressed: [3, 3, 3, 3, 3, 1, 2, 3, 5, 5, 5, 5, 5],
      compressed: [-4, 3, 2, 1, 2, 3, -4, 5],
    },
    { uncompressed: Array(128).fill(4), compressed: [-127, 4] },
    { uncompressed: Array(200).fill(4), compressed: [-127, 4, -71, 4] },
    { uncompressed: [3, ...Array(128).fill(4)], compressed: [0, 3, -127, 4] },
    { uncompressed: [...Array(128).fill(4), 3], compressed: [-127, 4, 0, 3] },
  ];

  for (const testCase of testCases) {
    expect(packBitsCompression(new Uint8Array(testCase.uncompressed))).toEqual(
      new Int8Array(testCase.compressed)
    );
  }
});

test('compressBitImage', () => {
  expect(
    compressBitImage({
      height: 10,
      data: new Uint8Array([1, 2, 3, 4, 5]),
      compressed: false,
    })
  ).toEqual({
    height: 10,
    data: new Int8Array([4, 1, 2, 3, 4, 5]),
    compressed: true,
  });
});

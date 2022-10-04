import { createImageData } from 'canvas';
import {
  assertBinaryImageDatasEqual,
  F,
  makeBinaryImageData,
} from '../test/utils';
import { simpleRemoveNoise } from './noise';

describe.each([1, 4] as const)(
  'simpleRemoveNoise with %s channels',
  (channelCount) => {
    test('blank image', () => {
      const data = new Uint8ClampedArray(channelCount * 10 * 10);
      const blankImage = createImageData(data, 10, 10);
      assertBinaryImageDatasEqual(
        blankImage,
        simpleRemoveNoise(blankImage, 255)
      );
    });

    test('noisy image', () => {
      const imageData = makeBinaryImageData(
        `
          .#....
          ...#..
          .#...#
        `,
        channelCount
      );

      const expected = makeBinaryImageData(
        `
          ......
          ......
          ......
        `,
        channelCount
      );

      assertBinaryImageDatasEqual(simpleRemoveNoise(imageData, F), expected);
    });

    test('image with a sufficient number of foreground neighbors', () => {
      const imageData = makeBinaryImageData(
        `
          .#....
          ...##.
          .#...#
        `,
        channelCount
      );

      const expected = makeBinaryImageData(
        `
          ......
          ...##.
          ......
        `,
        channelCount
      );

      assertBinaryImageDatasEqual(simpleRemoveNoise(imageData, F), expected);
    });

    test('configurable minimum neighbor count', () => {
      const imageData = makeBinaryImageData(
        `
          .#....
          ...###
          .#...#
        `,
        channelCount
      );

      const expected = makeBinaryImageData(
        `
          ......
          ....##
          ......
        `,
        channelCount
      );

      assertBinaryImageDatasEqual(simpleRemoveNoise(imageData, F, 2), expected);
    });
  }
);

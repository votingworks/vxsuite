// 09-image-diff.ts
//
// Task: Given streaming pixel data from two images, produce an image matrix (2d
// array) that identifies pixels that don't match. The images are guaranteed to
// have the same dimensions.
//

import { iter, typedAs } from '@votingworks/basics';
import { TODO } from '../src/todo';
import { run } from '../src/example';
import { collecting } from '../src/collecting';

type Pixel = number; // Value from 0 to 255, representing a shade of gray

type ImageStream = Iterable<Pixel>;

interface Dimensions {
  width: number;
  height: number;
}

type Diff = Array<boolean[]>; // True means the pixels match, false means they don't

interface DiffImagesInput {
  dimensions: Dimensions;
  image1: ImageStream;
  image2: ImageStream;
}

function diffImages({ dimensions, image1, image2 }: DiffImagesInput): Diff {
  TODO();
}

function diffImagesReference({
  dimensions,
  image1,
  image2,
}: DiffImagesInput): Diff {
  const diff: Diff = [];
  const image1Iterator = image1[Symbol.iterator]();
  const image2Iterator = image2[Symbol.iterator]();

  for (let y = 0; y < dimensions.height; y += 1) {
    const row = [];

    for (let x = 0; x < dimensions.width; x += 1) {
      const pixel1 = image1Iterator.next().value;
      const pixel2 = image2Iterator.next().value;

      row.push(pixel1 === pixel2);
    }

    diff.push(row);
  }

  return diff;
}

const DIMENSIONS: Dimensions = {
  width: 2,
  height: 4,
};
const IMAGE_1 = [0, 255, 255, 0, 100, 150, 0, 255];
const IMAGE_2 = [0, 255, 0, 0, 100, 255, 255, 0];

// Expected diff: [
//   [true, true],
//   [false, true],
//   [true, false],
//   [false, false],
// ]

run({
  name: 'diffImages',
  makeInput: () =>
    typedAs<DiffImagesInput>({
      dimensions: DIMENSIONS,
      image1: IMAGE_1,
      image2: IMAGE_2,
    }),
  referenceImplementation: collecting(diffImagesReference),
  exerciseImplementation: collecting(diffImages),
  solutionImplementation: collecting(diffImagesSolution),
});

// Scroll down for solutions. ↓
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
// Solutions ↓

function diffImagesSolution({
  dimensions,
  image1,
  image2,
}: DiffImagesInput): Diff {
  return iter(image1)
    .zip(image2)
    .map(([pixel1, pixel2]) => pixel1 === pixel2)
    .chunks(dimensions.width)
    .toArray();
}

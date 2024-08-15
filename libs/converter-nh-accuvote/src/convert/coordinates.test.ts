import { typedAs } from '@votingworks/basics';
import { CompleteTimingMarks, Rect } from '@votingworks/ballot-interpreter';
import fc from 'fast-check';
import {
  BallotGridPoint,
  BallotGridValue,
  ImageGridValue,
  PdfGridValue,
  ballotGridPointToImagePoint,
  distance,
  imagePointToPdfPoint,
  imageSizeToPdfSize,
  newBallotGridPoint,
  newBallotGridSize,
  newImagePoint,
  newImageSize,
  newPdfPoint,
  newPdfSize,
  pdfPointToImagePoint,
  pdfSizeToImageSize,
  rectCenter,
  vecAdd,
} from './coordinates';

test('newBallotGridPoint', () => {
  const point = newBallotGridPoint(1, 2);
  expect(point).toEqual({ x: 1, y: 2 });
});

test('newImagePoint', () => {
  const point = newImagePoint(3, 4);
  expect(point).toEqual({ x: 3, y: 4 });
});

test('newPdfPoint', () => {
  const point = newPdfPoint(5, 6);
  expect(point).toEqual({ x: 5, y: 6 });
});

test('newBallotGridSize', () => {
  const size = newBallotGridSize(7, 8);
  expect(size).toEqual({ width: 7, height: 8 });
});

test('newImageSize', () => {
  const size = newImagePoint(9, 10);
  expect(size).toEqual({ x: 9, y: 10 });
});

test('newPdfSize', () => {
  const size = newPdfPoint(11, 12);
  expect(size).toEqual({ x: 11, y: 12 });
});

test('PDF point is not assignable to image point', () => {
  const pdfPoint = newPdfPoint(1, 2);
  // @ts-expect-error - PDF point is not assignable to image point.
  typedAs<ImageData>(pdfPoint);
});

test('Image point is not assignable to PDF point', () => {
  const imagePoint = newImagePoint(3, 4);
  // @ts-expect-error - Image point is not assignable to PDF point.
  typedAs<PdfPoint>(imagePoint);
});

test('Ballot grid point is not assignable to image point', () => {
  const ballotGridPoint = newBallotGridPoint(5, 6);
  // @ts-expect-error - Ballot grid point is not assignable to image point.
  typedAs<ImagePoint>(ballotGridPoint);
});

test('Image point is not assignable to ballot grid point', () => {
  const imagePoint = newImagePoint(7, 8);
  // @ts-expect-error - Image point is not assignable to ballot grid point.
  typedAs<BallotGridPoint>(imagePoint);
});

test('rectCenter with BallotGridValue', () => {
  const center = rectCenter({
    left: 1,
    top: 2,
    width: 3,
    height: 4,
  } as unknown as Rect<BallotGridValue>);
  expect(center).toEqual({ x: 2.5, y: 4 });
});

test('rectCenter with ImageGridValue', () => {
  const center = rectCenter({
    left: 1,
    top: 2,
    width: 3,
    height: 4,
  } as unknown as Rect<ImageGridValue>);
  expect(center).toEqual({ x: 2.5, y: 4 });
});

test('rectCenter with PdfGridValue', () => {
  const center = rectCenter({
    left: 1,
    top: 2,
    width: 3,
    height: 4,
  } as unknown as Rect<PdfGridValue>);
  expect(center).toEqual({ x: 2.5, y: 4 });
});

test('vecAdd', () => {
  expect(vecAdd(newBallotGridPoint(1, 2), newBallotGridSize(3, 4))).toEqual(
    newBallotGridPoint(4, 6)
  );
  expect(vecAdd(newImagePoint(1, 2), newImageSize(3, 4))).toEqual(
    newImagePoint(4, 6)
  );
  expect(vecAdd(newPdfPoint(1, 2), newPdfSize(3, 4))).toEqual(
    newPdfPoint(4, 6)
  );
});

test('ballotGridPointToImagePoint', () => {
  const completeTimingMarks = typedAs<Partial<CompleteTimingMarks>>({
    leftRects: [
      { left: 1, top: 1, width: 3, height: 1 },
      { left: 1, top: 3, width: 3, height: 1 },
      { left: 1, top: 5, width: 3, height: 1 },
    ],
    topRects: [
      { left: 1, top: 1, width: 3, height: 1 },
      { left: 3, top: 1, width: 3, height: 1 },
    ],
  }) as unknown as CompleteTimingMarks;

  expect(
    ballotGridPointToImagePoint(completeTimingMarks, newBallotGridPoint(0, 0))
  ).toEqual(newImagePoint(2.5, 1.5));
  expect(
    ballotGridPointToImagePoint(completeTimingMarks, newBallotGridPoint(1, 1))
  ).toEqual(newImagePoint(4.5, 3.5));
});

test('imagePointToPdfPoint', () => {
  const letterSizePdf = newPdfSize(396, 612);
  const pdfPpi = 72;

  // top-left corner
  expect(
    imagePointToPdfPoint(letterSizePdf, 200, pdfPpi, newImagePoint(0, 0))
  ).toEqual(newPdfPoint(0, 612));

  // top-right corner
  expect(
    imagePointToPdfPoint(letterSizePdf, 200, pdfPpi, newImagePoint(1100, 0))
  ).toEqual(newPdfPoint(396, 612));

  // bottom-right corner
  expect(
    imagePointToPdfPoint(letterSizePdf, 200, pdfPpi, newImagePoint(1100, 1700))
  ).toEqual(newPdfPoint(396, 0));

  // bottom-left corner
  expect(
    imagePointToPdfPoint(letterSizePdf, 200, pdfPpi, newImagePoint(0, 1700))
  ).toEqual(newPdfPoint(0, 0));

  // some other point
  expect(
    imagePointToPdfPoint(letterSizePdf, 200, pdfPpi, newImagePoint(100, 100))
  ).toEqual(newPdfPoint(36, 576));
});

test('pdfPointToImagePoint', () => {
  fc.assert(
    fc.property(
      fc
        .record({
          width: fc.integer({ min: 1, max: 1000 }),
          height: fc.integer({ min: 1, max: 1000 }),
        })
        .chain(({ width, height }) =>
          fc.record({
            x: fc.integer({ min: 0, max: width }),
            y: fc.integer({ min: 0, max: height }),
            width: fc.constant(width),
            height: fc.constant(height),
          })
        ),
      ({ x, y, width, height }) => {
        const pdfSize = newPdfSize(width, height);
        const pdfPpi = 72;

        const imagePoint = imagePointToPdfPoint(
          pdfSize,
          200,
          pdfPpi,
          pdfPointToImagePoint(pdfSize, 200, pdfPpi, newPdfPoint(x, y))
        );
        expect(imagePoint.x).toBeCloseTo(x);
        expect(imagePoint.y).toBeCloseTo(y);
      }
    )
  );
});

test('imageSizeToPdfSize', () => {
  expect(imageSizeToPdfSize(200, 72, newImageSize(1100, 1700))).toEqual(
    newPdfSize(396, 612)
  );
});

test('pdfSizeToImageSize', () => {
  expect(pdfSizeToImageSize(200, 72, newPdfSize(396, 612))).toEqual(
    newImageSize(1100, 1700)
  );
});

test('imageSizeToPdfSize and pdfSizeToImageSize are inverses', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 1000 }),
      fc.integer({ min: 1, max: 1000 }),
      (width, height) => {
        const pdfSize = newPdfSize(width, height);
        const imageSize = pdfSizeToImageSize(200, 72, pdfSize);
        const roundTrippedPdfSize = imageSizeToPdfSize(200, 72, imageSize);
        expect(roundTrippedPdfSize.width).toBeCloseTo(width);
        expect(roundTrippedPdfSize.height).toBeCloseTo(height);
      }
    )
  );
});

test('distance between two points', () => {
  expect(distance(newBallotGridPoint(0, 0), newBallotGridPoint(3, 4))).toEqual(
    5
  );
});

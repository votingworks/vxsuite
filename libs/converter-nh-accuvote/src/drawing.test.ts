import { assertDefined } from '@votingworks/basics';
import fc from 'fast-check';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { newPdfSize } from './convert/coordinates';
import { fitTextWithinSize } from './drawing';

test('fitTextWithinSize no shrink', async () => {
  const doc = await PDFDocument.create();
  const font = doc.embedStandardFont(StandardFonts.Helvetica);
  const size = newPdfSize(100, 100);
  const result = assertDefined(
    fitTextWithinSize({
      text: 'Hi',
      config: {
        font,
        minFontSize: 10,
        maxFontSize: 20,
      },
      size,
    })
  );
  expect(result.text).toEqual('Hi');
  expect(result.fontSize).toEqual(20);
});

test('fitTextWithinSize slight shrink', async () => {
  const doc = await PDFDocument.create();
  const font = doc.embedStandardFont(StandardFonts.Helvetica);
  const size = newPdfSize(100, 100);
  const result = assertDefined(
    fitTextWithinSize({
      text: 'Hello, world!',
      config: {
        font,
        minFontSize: 10,
        maxFontSize: 20,
      },
      size,
    })
  );
  expect(result.text).toEqual('Hello, world!');
  expect(result.fontSize).toEqual(18);
});

test('fitTextWithinSize slightly truncated', async () => {
  const doc = await PDFDocument.create();
  const font = doc.embedStandardFont(StandardFonts.Helvetica);
  const size = newPdfSize(50, 50);
  const result = assertDefined(
    fitTextWithinSize({
      text: 'Hello, world!',
      config: {
        font,
        minFontSize: 10,
        maxFontSize: 20,
      },
      size,
    })
  );
  expect(result.text).toEqual('Hello, w…');
  expect(result.fontSize).toEqual(10);
});

test('fitTextWithinSize severely truncated', async () => {
  const doc = await PDFDocument.create();
  const font = doc.embedStandardFont(StandardFonts.Helvetica);
  const size = newPdfSize(20, 20);
  const result = assertDefined(
    fitTextWithinSize({
      text: 'Hello, world!',
      config: {
        font,
        minFontSize: 10,
        maxFontSize: 20,
      },
      size,
    })
  );
  expect(result.text).toEqual('H…');
  expect(result.fontSize).toEqual(10);
});

test('fitTextWithinSize no fit', async () => {
  const doc = await PDFDocument.create();
  const font = doc.embedStandardFont(StandardFonts.Helvetica);
  const size = newPdfSize(10, 10);
  const result = fitTextWithinSize({
    text: 'Hello, world!',
    config: {
      font,
      minFontSize: 10,
      maxFontSize: 20,
    },
    size,
  });
  expect(result).toBeUndefined();
});

test('fitTextWithinSize only truncates when font size is minimum', async () => {
  const doc = await PDFDocument.create();
  const font = doc.embedStandardFont(StandardFonts.Helvetica);

  fc.assert(
    fc.property(
      fc.string(),
      fc.integer({ min: 1, max: 100 }),
      fc.integer({ min: 1, max: 100 }),
      fc.integer({ min: 1, max: 100 }).chain((minFontSize) =>
        fc
          .integer({ min: 1, max: 100 })
          .filter((maxFontSize) => maxFontSize >= minFontSize)
          .map((maxFontSize) => [minFontSize, maxFontSize] as const)
      ),
      (text, width, height, [minFontSize, maxFontSize]) => {
        const size = newPdfSize(width, height);
        const result = fitTextWithinSize({
          text,
          config: {
            font,
            minFontSize,
            maxFontSize,
          },
          size,
        });

        if (result && result.text !== text) {
          expect(result.fontSize).toEqual(minFontSize);
        }
      }
    )
  );
});

import { readFileSync } from 'fs';
import path from 'path';
import { pdfToCustomPaperHandlerBitmapSeries } from './rust_addon';

test('pdfToCustomPaperHandlerBitmapSeries', () => {
  console.log(
    pdfToCustomPaperHandlerBitmapSeries(
      readFileSync(path.join(__dirname, '../../test/fixtures/ballot_1700.pdf')),
      {
        whiteThreshold: 230,
        scale: 200 / 72,
      }
    )
  );
});

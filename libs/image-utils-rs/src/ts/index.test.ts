import { readFileSync } from 'fs';
import { pdfToCustomPaperHandlerBitmapSeries } from './rust_addon';

test('pdfToCustomPaperHandlerBitmapSeries', () => {
  pdfToCustomPaperHandlerBitmapSeries(
    readFileSync('../../test/fixtures/ballot_1700.pdf'),
    {
      whiteThreshold: 230,
      width: 1700,
    }
  );
});

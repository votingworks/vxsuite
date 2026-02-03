import { describe, expect, test } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { getPdfPageCount } from './pdf_utils';

describe('getPdfPageCount', () => {
  test('returns 1 for a single-page PDF', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const pdfBytes = await pdf.save();
    expect(await getPdfPageCount(pdfBytes)).toEqual(1);
  });

  test('returns correct count for a multi-page PDF', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.addPage();
    pdf.addPage();
    const pdfBytes = await pdf.save();
    expect(await getPdfPageCount(pdfBytes)).toEqual(3);
  });

  test('does not consume the input buffer', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const pdfBytes = await pdf.save();
    const originalLength = pdfBytes.length;
    await getPdfPageCount(pdfBytes);
    expect(pdfBytes.length).toEqual(originalLength);
  });
});

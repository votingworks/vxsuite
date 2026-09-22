import { describe, expect, test } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { sleep } from '@votingworks/basics';
import { concatenatePdfs, getPdfPageCount } from './pdf_utils.js';

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

describe('concatenatePdfs', () => {
  // Pages are identified by width so their order in the merged document is
  // observable.
  async function pdfWithPageWidths(widths: number[]): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    for (const width of widths) {
      pdf.addPage([width, 100]);
    }
    return pdf.save();
  }

  async function pageWidthsOf(pdfBytes: Uint8Array): Promise<number[]> {
    const pdf = await PDFDocument.load(pdfBytes);
    return pdf.getPages().map((page) => page.getWidth());
  }

  test('concatenates documents in order', async () => {
    const merged = (
      await concatenatePdfs([
        await pdfWithPageWidths([10]),
        await pdfWithPageWidths([20, 30]),
        await pdfWithPageWidths([40, 50, 60]),
      ])
    ).unsafeUnwrap();
    expect(await pageWidthsOf(merged)).toEqual([10, 20, 30, 40, 50, 60]);
  });

  test('produces the same bytes for the same inputs', async () => {
    const pdfs = [await pdfWithPageWidths([10]), await pdfWithPageWidths([20])];
    const first = (await concatenatePdfs(pdfs)).unsafeUnwrap();
    await sleep(1100);
    const second = (await concatenatePdfs(pdfs)).unsafeUnwrap();
    expect(second).toEqual(first);
  });

  test('refuses inputs whose combined size exceeds the maximum', async () => {
    const pdf = await pdfWithPageWidths([10]);
    const result = await concatenatePdfs([pdf, pdf], {
      maxSizeBytes: pdf.byteLength,
    });
    expect(result.err()?.message).toMatch(/Output PDF would be too large/);
  });

  test('accepts inputs at exactly the maximum size', async () => {
    const pdf = await pdfWithPageWidths([10]);
    const merged = (
      await concatenatePdfs([pdf, pdf], { maxSizeBytes: pdf.byteLength * 2 })
    ).unsafeUnwrap();
    expect(await pageWidthsOf(merged)).toEqual([10, 10]);
  });

  test('accepts the same document more than once', async () => {
    const pdf = await pdfWithPageWidths([10, 20]);
    const merged = (await concatenatePdfs([pdf, pdf, pdf])).unsafeUnwrap();
    expect(await pageWidthsOf(merged)).toEqual([10, 20, 10, 20, 10, 20]);
    expect(await pageWidthsOf(pdf)).toEqual([10, 20]);
  });
});

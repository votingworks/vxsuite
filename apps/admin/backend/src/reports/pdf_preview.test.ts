import { expect, test, vi } from 'vitest';
import { renderToPdf } from '@votingworks/printing';
import { getPdfPageCount } from '@votingworks/image-utils/pdf';
import React from 'react';
import { MAX_PREVIEW_PAGE_COUNT, renderPdfPreview } from './pdf_preview.js';

vi.mock(import('@votingworks/image-utils/pdf'), async (importActual) => ({
  ...(await importActual()),
  getPdfPageCount: vi.fn(),
}));

test('renders each page as a PNG sized in PDF points', async () => {
  vi.mocked(getPdfPageCount).mockResolvedValueOnce(1);
  const pdf = (
    await renderToPdf({ document: React.createElement('p', null, 'Report') })
  ).unsafeUnwrap();
  const preview = await renderPdfPreview(pdf);
  expect(preview.pageCount).toEqual(1);
  expect(preview.pages).toHaveLength(1);
  expect(preview.pages[0]).toMatchObject({ width: 612, height: 792 });
});

test('omits pages when the report is too long to preview', async () => {
  vi.mocked(getPdfPageCount).mockResolvedValueOnce(MAX_PREVIEW_PAGE_COUNT + 1);
  expect(await renderPdfPreview(new Uint8Array())).toEqual({
    pageCount: MAX_PREVIEW_PAGE_COUNT + 1,
    pages: [],
  });
});

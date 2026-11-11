import {
  getPdfPageCount,
  type PdfPagePng,
  pdfToPngPages,
} from '@votingworks/image-utils/pdf';

/** Larger reports are not previewed; they must be printed or exported. */
export const MAX_PREVIEW_PAGE_COUNT = 50;

const PREVIEW_SCALE = 200 / 72;

/** A report PDF rendered as page images for previewing. */
export interface PdfPreview {
  readonly pageCount: number;
  /** Empty when `pageCount` exceeds {@link MAX_PREVIEW_PAGE_COUNT}. */
  readonly pages: PdfPagePng[];
}

/** Renders a report PDF as page images for previewing. */
export async function renderPdfPreview(pdf: Uint8Array): Promise<PdfPreview> {
  const pageCount = await getPdfPageCount(pdf);
  return {
    pageCount,
    pages:
      pageCount > MAX_PREVIEW_PAGE_COUNT
        ? []
        : await pdfToPngPages(pdf, { scale: PREVIEW_SCALE }),
  };
}

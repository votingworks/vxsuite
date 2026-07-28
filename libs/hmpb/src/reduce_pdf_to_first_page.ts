import { Buffer } from 'node:buffer';
import { PDFDocument } from 'pdf-lib';
import { normalizePdf } from './normalize_pdf';

/**
 * Returns a copy of the given ballot PDF containing only its first page.
 *
 * UOCAVA (overseas/military) ballots are printed in the field, often on
 * single-sided printers, so they must be a single page. NH state ballots are
 * laid out (via auto-fit paper sizing) so that all contest content fits on the
 * front page; the back page carries only the fold/mailing panel. Dropping it
 * therefore loses no votable content.
 */
export async function reducePdfToFirstPage(
  pdf: Uint8Array
): Promise<Uint8Array> {
  const source = await PDFDocument.load(pdf);
  const firstPageOnly = await PDFDocument.create();
  const [firstPage] = await firstPageOnly.copyPages(source, [0]);
  firstPageOnly.addPage(firstPage);
  // useObjectStreams: false keeps output deterministic across runs (see
  // concatenatePdfs for the rationale).
  return normalizePdf(
    Buffer.from(await firstPageOnly.save({ useObjectStreams: false }))
  );
}

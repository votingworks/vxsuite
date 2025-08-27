import {
  convertPdfToGrayscale,
  RenderDocument,
  calibrationSheetTemplate,
  Renderer,
} from '@votingworks/hmpb';
import { HmpbBallotPaperSize } from '@votingworks/types';

export async function renderBallotPdf(
  document: RenderDocument
): Promise<Uint8Array> {
  const pdf = await document.renderToPdf();
  return await convertPdfToGrayscale(pdf);
}

export async function renderCalibrationSheetPdf(
  renderer: Renderer,
  paperSize: HmpbBallotPaperSize
): Promise<Uint8Array> {
  const document = await calibrationSheetTemplate.render(renderer, paperSize);
  return await convertPdfToGrayscale(await document.renderToPdf());
}

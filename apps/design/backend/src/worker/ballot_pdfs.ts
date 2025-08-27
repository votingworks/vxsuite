import {
  convertPdfToGrayscale,
  calibrationSheetTemplate,
  Renderer,
  BallotTemplateId,
} from '@votingworks/hmpb';
import { HmpbBallotPaperSize } from '@votingworks/types';

export async function normalizeBallotColorModeForPrinting(
  ballotPdf: Uint8Array,
  ballotTemplateId: BallotTemplateId
): Promise<Uint8Array> {
  if (ballotTemplateId !== 'NhBallot') return ballotPdf;
  return await convertPdfToGrayscale(ballotPdf);
}

export async function renderCalibrationSheetPdf(
  renderer: Renderer,
  paperSize: HmpbBallotPaperSize
): Promise<Uint8Array> {
  const document = await calibrationSheetTemplate.render(renderer, paperSize);
  const pdf = await document.renderToPdf();
  return await convertPdfToGrayscale(pdf);
}

import {
  convertPdfToGrayscale,
  convertPdfToSpotColor,
  calibrationSheetTemplate,
  Renderer,
  BallotTemplateId,
  NhStateSpotColors,
} from '@votingworks/hmpb';
import { HmpbBallotPaperSize } from '@votingworks/types';

export async function normalizeBallotColorModeForPrinting(
  ballotPdf: Uint8Array,
  ballotTemplateId: BallotTemplateId
): Promise<Uint8Array> {
  switch (ballotTemplateId) {
    case 'NhBallot':
      return await convertPdfToGrayscale(ballotPdf);
    case 'NhStateBallot':
      return await convertPdfToSpotColor(
        ballotPdf,
        Object.values(NhStateSpotColors)
      );
    default:
      return ballotPdf;
  }
}

export async function renderCalibrationSheetPdf(
  renderer: Renderer,
  paperSize: HmpbBallotPaperSize
): Promise<Uint8Array> {
  const document = await calibrationSheetTemplate.render(renderer, paperSize);
  const pdf = await document.renderToPdf();
  return await convertPdfToGrayscale(pdf);
}

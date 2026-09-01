import { assert } from '@votingworks/basics';
import {
  convertPdfToGrayscale,
  calibrationSheetTemplate,
  Renderer,
  BallotTemplateId,
  NhStateSpotColors,
  convertPdfFileToGrayscale,
  convertPdfToSpotColor,
} from '@votingworks/hmpb';
import { HmpbBallotPaperSize } from '@votingworks/types';

const NEEDS_COLOR_NORMALIZATION: Record<BallotTemplateId, boolean> = {
  MiBallot: false,
  MsBallot: false,
  NhBallot: true,
  NhStateBallot: true,
  VxDefaultBallot: false,
};

export function needsColorNormalization(template: BallotTemplateId): boolean {
  return NEEDS_COLOR_NORMALIZATION[template];
}

export async function normalizeBallotColorModeForPrinting(p: {
  ballotPath: string;
  ballotTemplateId: BallotTemplateId;
}): Promise<void> {
  switch (p.ballotTemplateId) {
    case 'NhBallot':
      return await convertPdfFileToGrayscale(p.ballotPath);
    case 'NhStateBallot':
      return await convertPdfToSpotColor({
        pdfPath: p.ballotPath,
        spotColors: Object.values(NhStateSpotColors),
      });
    default:
      assert(!needsColorNormalization(p.ballotTemplateId));
      break;
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

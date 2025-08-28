import {
  convertPdfToGrayscale,
  BaseBallotProps,
  calibrationSheetTemplate,
  Renderer,
} from '@votingworks/hmpb';
import { HmpbBallotPaperSize } from '@votingworks/types';

export async function normalizeBallotColorModeForPrinting(
  ballotPdf: Uint8Array,
  props: BaseBallotProps
): Promise<Uint8Array> {
  /**
   * Specific to NH V4 ballots with tinted headers/footers.
   * See `import('@votingworks/hmpb').NhBallotProps`.
   */
  const needsColorPrint = 'colorTint' in props && !!props.colorTint;

  if (needsColorPrint) {
    return ballotPdf;
  }

  return await convertPdfToGrayscale(ballotPdf);
}

export async function renderCalibrationSheetPdf(
  renderer: Renderer,
  paperSize: HmpbBallotPaperSize
): Promise<Uint8Array> {
  const document = await calibrationSheetTemplate.render(renderer, paperSize);
  return await convertPdfToGrayscale(await document.renderToPdf());
}

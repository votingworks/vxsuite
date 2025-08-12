import {
  convertPdfToGrayscale,
  BaseBallotProps,
  RenderDocument,
  calibrationSheetTemplate,
  Renderer,
} from '@votingworks/hmpb';
import { HmpbBallotPaperSize } from '@votingworks/types';

export async function renderBallotPdf(
  props: BaseBallotProps,
  document: RenderDocument
): Promise<Uint8Array> {
  /**
   * Specific to NH V4 ballots with tinted headers/footers.
   * See `import('@votingworks/hmpb').NhBallotProps`.
   */
  const needsColorPrint = 'colorTint' in props && !!props.colorTint;

  const colorPdf = await document.renderToPdf();
  if (needsColorPrint) {
    return colorPdf;
  }

  return await convertPdfToGrayscale(colorPdf);
}

export async function renderCalibrationSheetPdf(
  renderer: Renderer,
  paperSize: HmpbBallotPaperSize
): Promise<Uint8Array> {
  const document = await calibrationSheetTemplate.render(renderer, paperSize);
  return await convertPdfToGrayscale(await document.renderToPdf());
}

import {
  convertPdfToGrayscale,
  BaseBallotProps,
  RenderDocument,
} from '@votingworks/hmpb';

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

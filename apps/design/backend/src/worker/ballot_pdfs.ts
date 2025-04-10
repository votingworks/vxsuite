import { ReadStream } from 'node:fs';
import { Buffer } from 'node:buffer';

import { BaseBallotProps, RenderDocument } from '@votingworks/hmpb';

import { convertPdfToGrayscale } from './grayscale';

export async function renderBallotPdf(
  props: BaseBallotProps,
  document: RenderDocument
): Promise<Buffer | ReadStream> {
  /**
   * Specific to NH V4 ballots with tinted headers/footers.
   * See `import('@votingworks/hmpb').NhBallotProps`.
   */
  const needsColorPrint = 'colorTint' in props && !!props.colorTint;

  const colorPdf = await document.renderToPdf();
  if (needsColorPrint) {
    return colorPdf;
  }

  return convertPdfToGrayscale(colorPdf);
}

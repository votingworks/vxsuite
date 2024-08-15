import { Optional, assert } from '@votingworks/basics';
import { PDFFont } from 'pdf-lib';
import { PdfSize, newPdfSize } from './convert/coordinates';

/**
 * Configuration for fitting text within a size.
 */
export interface TextAppearanceConfig {
  font: PDFFont;
  minFontSize: number;
  maxFontSize: number;
}

/**
 * Fits text within the given size, adjusting the font size as necessary. Tries
 * to use the largest font size that will fit the text within the size. If even
 * the smallest font size is too large, the text will be truncated and an
 * ellipsis will be added.
 *
 * @returns The bounding box of the resized text and the text that was actually
 *          sized, or `undefined` if the text was too large to fit within the
 *          bounds even at the smallest font size.
 */
export function fitTextWithinSize({
  text,
  config: { font, minFontSize, maxFontSize },
  size,
}: {
  text: string;
  config: TextAppearanceConfig;
  size: PdfSize;
}): Optional<{ size: PdfSize; text: string; fontSize: number }> {
  assert(minFontSize > 0, 'minFontSize must be greater than 0');
  assert(
    maxFontSize >= minFontSize,
    'maxFontSize must be greater than or equal to minFontSize'
  );
  assert(size.width > 0, 'size.width must be greater than 0');
  assert(size.height > 0, 'size.height must be greater than 0');

  const textWidth = font.widthOfTextAtSize(text, maxFontSize);
  const textHeight = font.heightAtSize(maxFontSize);

  if (textWidth <= size.width && textHeight <= size.height) {
    return {
      size: newPdfSize(textWidth, textHeight),
      text,
      fontSize: maxFontSize,
    };
  }

  if (maxFontSize > minFontSize) {
    return fitTextWithinSize({
      text,
      config: {
        font,
        minFontSize,
        maxFontSize: maxFontSize - 1,
      },
      size,
    });
  }

  // at this point, we've tried all font sizes from maxFontSize down to
  // minFontSize, and none of them fit within the size

  if (textHeight > size.height) {
    // we can't reduce the font size enough to fit the text within the size
    return undefined;
  }

  let truncatedText = text;
  let truncatedTextWidth = textWidth;

  const ellipsis = '…';

  do {
    truncatedText = truncatedText.slice(0, -1);
    truncatedTextWidth = font.widthOfTextAtSize(
      truncatedText + ellipsis,
      maxFontSize
    );
  } while (truncatedTextWidth > size.width && truncatedText.length > 0);

  if (truncatedText.length === 0) {
    // even the smallest font size is too large
    return undefined;
  }

  return {
    size: newPdfSize(truncatedTextWidth, textHeight),
    text: truncatedText + ellipsis,
    fontSize: maxFontSize,
  };
}

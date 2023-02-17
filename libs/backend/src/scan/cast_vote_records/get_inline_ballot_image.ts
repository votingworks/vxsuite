import { loadImage, toDataUrl, toImageData } from '@votingworks/image-utils';
import { InlineBallotImage } from '@votingworks/types';

const CVR_BALLOT_IMAGE_SCALE = 0.5;

/**
 * Converts an image file to a base64 image URL
 */
async function loadImagePathShrinkBase64(
  path: string,
  factor: number
): Promise<string> {
  const image = await loadImage(path);
  const newImageData = toImageData(image, {
    maxWidth: image.width * factor,
    maxHeight: image.height * factor,
  });
  return toDataUrl(newImageData, 'image/jpeg').slice(
    'data:image/jpeg;base64,'.length
  );
}

/**
 * Converts an image file to an {@link InlineBallotImage}
 */
export async function getInlineBallotImage(
  imageFilename: string
): Promise<InlineBallotImage> {
  return {
    normalized: await loadImagePathShrinkBase64(
      imageFilename,
      CVR_BALLOT_IMAGE_SCALE
    ),
  };
}

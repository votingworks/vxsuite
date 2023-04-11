import { loadImage, toDataUrl, toImageData } from '@votingworks/image-utils';

/**
 * Default factor by which to scale ballot images.
 */
export const CVR_BALLOT_IMAGE_SCALE = 0.5;

/**
 * Loads a ballot image from file into a data URL. We are currently shrinking
 * the ballot images for transfer, so this will shrink the image as well. Uses
 * a default scale factor of {@link CVR_BALLOT_IMAGE_SCALE}.
 */
export async function loadBallotImageBase64(
  path: string,
  factor: number = CVR_BALLOT_IMAGE_SCALE
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

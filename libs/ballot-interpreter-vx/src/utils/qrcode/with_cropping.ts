import { Rect } from '@votingworks/types';
import { DetectQrCode, DetectQrCodeResult } from '../../types';
import { crop } from '../crop';
import { flipRectVerticalAndHorizontal } from '../geometry';

/**
 * Makes a new QR code detector from an existing one that works by cropping the
 * bottom-right and top-left corners of the image before passing it on.
 */
export function withCropping(
  decode: DetectQrCode,
  { widthFraction = 1 / 4, heightFraction = 1 / 5 } = {}
): DetectQrCode {
  return async (imageData): Promise<DetectQrCodeResult | undefined> => {
    const width = Math.floor(imageData.width * widthFraction);
    const height = Math.floor(imageData.height * heightFraction);
    const searchBounds: Rect = {
      x: imageData.width - width,
      y: imageData.height - height,
      width,
      height,
    };

    {
      const cropped = crop(imageData, searchBounds);
      const decoded = await decode(cropped);

      if (decoded) {
        return {
          data: decoded.data,
          rightSideUp: decoded.rightSideUp ?? true,
        };
      }
    }

    {
      const cropped = crop(
        imageData,
        flipRectVerticalAndHorizontal(
          { x: 0, y: 0, width: imageData.width, height: imageData.height },
          searchBounds
        )
      );
      const decoded = await decode(cropped);

      if (decoded) {
        return {
          data: decoded.data,
          rightSideUp: decoded.rightSideUp ?? false,
        };
      }
    }

    return undefined;
  };
}

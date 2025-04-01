/* eslint @typescript-eslint/no-use-before-define: ["error", { "functions": false }] */

/* istanbul ignore file - [TODO] Adding browser tests in future PRs. @preserve */

import { assertDefined, deferred, err, ok, Result } from '@votingworks/basics';

export type NormalizeResult = Result<NormalizedImage, NormalizeError>;

export interface NormalizedImage {
  dataUrl: string;
  heightPx: number;
  widthPx: number;
}

export type NormalizeError =
  | { code: 'belowMinHeight'; heightPx: number }
  | { code: 'belowMinWidth'; widthPx: number }
  | { code: 'unsupportedImageType' }
  | { code: 'unexpected'; error: unknown };

export type NormalizeParams = {
  minHeightPx?: number;
  minWidthPx?: number;
} & (
  | { maxHeightPx: number; maxWidthPx?: number }
  | { maxHeightPx?: number; maxWidthPx: number }
);

/**
 * Normalizes an image, potentially resizing it to fit within the given bounds,
 * and returns a serialized data URL version of the final image with the same
 * encoding as the original.
 *
 * If minimum dimensions are specified, an error is returned for images that
 * fall below the given thresholds (see {@link NormlaizeError}).
 */
export async function normalizeFile(
  image: File,
  params: NormalizeParams
): Promise<NormalizeResult> {
  const mimeType = image.type;
  if (!isSupportedMimeType(mimeType)) {
    return err({ code: 'unsupportedImageType' });
  }

  return normalizeDataUrl(await serialize(image), mimeType, params);
}

const SUPPORTED_MIME_TYPES = ['image/png', 'image/jpeg'] as const;
export type ImageType = (typeof SUPPORTED_MIME_TYPES)[number];

/**
 * Normalizes an image, potentially resizing it to fit within the given bounds,
 * and returns a serialized data URL version of the final image with the same
 * encoding as the original.
 *
 * If minimum dimensions are specified, an error is returned for images that
 * fall below the given thresholds (see {@link NormalizeError}).
 */
export async function normalizeDataUrl(
  imageDataUrl: string,
  mimeType: ImageType,
  params: NormalizeParams
): Promise<NormalizeResult> {
  const { promise, resolve } = deferred<NormalizeResult>();

  const img = new Image();
  async function onLoad() {
    img.removeEventListener('error', onError);

    if (params.minHeightPx && img.height < params.minHeightPx) {
      resolve(err({ code: 'belowMinHeight', heightPx: img.height }));
    }

    if (params.minWidthPx && img.width < params.minWidthPx) {
      resolve(err({ code: 'belowMinWidth', widthPx: img.width }));
    }

    try {
      const scaleX = (params.maxWidthPx || img.width) / img.width;
      const scaleY = (params.maxHeightPx || img.height) / img.height;
      const scale = Math.min(scaleX, scaleY);

      if (scale >= 1) {
        return resolve(
          ok({
            dataUrl: imageDataUrl,
            heightPx: img.height,
            widthPx: img.width,
          })
        );
      }

      const canvas = document.createElement('canvas');
      const context = assertDefined(canvas.getContext('2d'));

      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      context.drawImage(img, 0, 0, canvas.width, canvas.height);

      resolve(
        ok({
          dataUrl: await canvasToDataUrl(canvas, mimeType),
          heightPx: canvas.height,
          widthPx: canvas.width,
        })
      );
    } catch (error) {
      resolve(err({ code: 'unexpected', error }));
    }
  }

  function onError(event: ErrorEvent) {
    img.removeEventListener('load', onLoad);

    if (event.error instanceof Error) {
      return resolve(err({ code: 'unexpected', error: event.error }));
    }

    return resolve(
      err({
        code: 'unexpected',
        error: new Error(`Error while decoding image for resize`),
      })
    );
  }

  img.addEventListener('load', onLoad, { once: true });
  img.addEventListener('error', onError, { once: true });
  img.src = imageDataUrl;

  return promise;
}

async function canvasToDataUrl(
  canvas: HTMLCanvasElement,
  mimeType?: ImageType
): Promise<string> {
  const { promise, reject, resolve } = deferred<string>();

  canvas.toBlob(async (blob) => {
    if (!blob) {
      return reject(new Error('Missing data in Canvas.toBlob() result'));
    }

    try {
      resolve(await serialize(blob));
    } catch (error) {
      reject(error);
    }
  }, mimeType);

  return promise;
}

async function serialize(blob: Blob): Promise<string> {
  const { promise, reject, resolve } = deferred<string>();

  const reader = new FileReader();

  function onRead() {
    reader.removeEventListener('error', onError);

    if (typeof reader.result !== 'string') {
      return reject(
        new Error(`Expected image data URL, got ${typeof reader.result}`)
      );
    }

    resolve(reader.result);
  }

  function onError(event: ProgressEvent<FileReader>) {
    reader.removeEventListener('load', onRead);

    if (event.target?.error) {
      return reject(event.target?.error);
    }

    reject(new Error('Error while serializing image data'));
  }

  reader.addEventListener('load', onRead, { once: true });
  reader.addEventListener('error', onError, { once: true });
  reader.readAsDataURL(blob);

  return promise;
}

function isSupportedMimeType(mimeType: string): mimeType is ImageType {
  return SUPPORTED_MIME_TYPES.includes(mimeType as ImageType);
}

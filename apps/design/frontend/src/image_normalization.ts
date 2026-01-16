import {
  assert,
  assertDefined,
  deferred,
  err,
  ok,
  Result,
} from '@votingworks/basics';

export type NormalizeResult = Result<NormalizedImage, NormalizeError>;

export interface NormalizedImage {
  dataUrl: string;
  heightPx: number;
  widthPx: number;
}

export type NormalizeError =
  | { code: 'invalidSvg' }
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

const SUPPORTED_MIME_TYPES = ['image/png', 'image/jpeg'] as const;
export type ImageType = (typeof SUPPORTED_MIME_TYPES)[number];

function isSupportedMimeType(mimeType: string): mimeType is ImageType {
  return SUPPORTED_MIME_TYPES.includes(mimeType as ImageType);
}

type NormalizeToSvgResult = Result<string, NormalizeError>;

/**
 * Normalizes an image as follows:
 *
 * - Vector SVG images: returned with no normalization, since vector SVGs can be
 * arbitrarily scaled later.
 *
 * - Bitmap images (PNG/JPG): Resized to fit within the given bounds if
 * necessary, then wrapped as an SVG.
 *
 * - SVG images that wrap a bitmap image:  Wrapped bitmap image is extracted,
 * resized, and then rewrapped as an SVG.
 *
 * If minimum dimensions are specified, an error is returned for images that
 * fall below the given thresholds (see {@link NormalizeError}).
 */
export async function normalizeImageToSvg(
  file: File,
  params: NormalizeParams
): Promise<NormalizeToSvgResult> {
  try {
    if (file.type === 'image/svg+xml') {
      const svgImageText = await loadSvgImage(file);
      const bitmapDataUrlResult = unwrapBitmapImageFromSvg(svgImageText);
      if (bitmapDataUrlResult.isErr()) {
        return bitmapDataUrlResult;
      }
      const bitmapDataUrl = bitmapDataUrlResult.ok();
      if (!bitmapDataUrl) {
        return ok(svgImageText);
      }
      return normalizeBitmapToSvg(bitmapDataUrl, params);
    }

    const dataUrl = await loadBitmapImage(file);
    return normalizeBitmapToSvg(dataUrl, params);
  } catch (error) {
    /* istanbul ignore next - @preserve */
    return err({ code: 'unexpected', error });
  }
}

async function normalizeBitmapToSvg(
  dataUrl: string,
  params: NormalizeParams
): Promise<NormalizeToSvgResult> {
  const mimeType = dataUrl.split(',')[0].match(/:(.*?);/)?.[1];
  if (!(mimeType && isSupportedMimeType(mimeType))) {
    return err({ code: 'unsupportedImageType' });
  }
  const normalizeResult = await normalizeDataUrl(dataUrl, mimeType, params);
  if (normalizeResult.isErr()) {
    return normalizeResult;
  }
  return ok(wrapBitmapImageAsSvg(normalizeResult.ok()));
}

/**
 * Normalizes a bitmap image, potentially resizing it to fit within the given
 * bounds, and returns a serialized data URL version of the final image with the
 * same encoding as the original.
 *
 * If minimum dimensions are specified, an error is returned for images that
 * fall below the given thresholds (see {@link NormalizeError}).
 */
async function normalizeDataUrl(
  imageDataUrl: string,
  mimeType: ImageType,
  params: NormalizeParams
): Promise<NormalizeResult> {
  const { promise, resolve } = deferred<NormalizeResult>();

  const img = new Image();
  async function onLoad() {
    img.removeEventListener('error', onError);

    if (params.minHeightPx && img.height < params.minHeightPx) {
      return resolve(err({ code: 'belowMinHeight', heightPx: img.height }));
    }

    if (params.minWidthPx && img.width < params.minWidthPx) {
      return resolve(err({ code: 'belowMinWidth', widthPx: img.width }));
    }

    try {
      const scaleX = (params.maxWidthPx || img.width) / img.width;
      const scaleY = (params.maxHeightPx || img.height) / img.height;
      const scale = Math.min(scaleX, scaleY);

      /* istanbul ignore else - @preserve */
      if (scale >= 1) {
        return resolve(
          ok({
            dataUrl: imageDataUrl,
            heightPx: img.height,
            widthPx: img.width,
          })
        );
      }

      /* istanbul ignore next - @preserve - Manually tested */
      {
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
      }
    } catch (error) {
      /* istanbul ignore next - @preserve */
      resolve(err({ code: 'unexpected', error }));
    }
  }

  /* istanbul ignore next - @preserve */
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

/* istanbul ignore next - @preserve */
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
      resolve(await loadBitmapImage(blob));
    } catch (error) {
      reject(error);
    }
  }, mimeType);

  return promise;
}

async function loadBitmapImage(blob: Blob): Promise<string> {
  const { promise, reject, resolve } = deferred<string>();

  const reader = new FileReader();

  function onRead() {
    reader.removeEventListener('error', onError);

    /* istanbul ignore next - @preserve */
    if (typeof reader.result !== 'string') {
      return reject(
        new Error(`Expected image data URL, got ${typeof reader.result}`)
      );
    }

    resolve(reader.result);
  }

  /* istanbul ignore next - @preserve */
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

async function loadSvgImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      /* istanbul ignore next - @preserve */
      const contents = e.target?.result;
      assert(typeof contents === 'string');
      resolve(contents);
    };
    reader.readAsText(file);
  });
}

function wrapBitmapImageAsSvg(img: NormalizedImage): string {
  const { dataUrl: imageDataUrl, heightPx: height, widthPx: width } = img;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <image href="${imageDataUrl}" width="${width}" height="${height}" />
  </svg>`;
}

/**
 * Detects if an SVG is a wrapper around a single bitmap image. If so, returns
 * the data url of the wrapped image along with its mime type. If not, returns
 * undefined.
 */
function unwrapBitmapImageFromSvg(
  svgImageText: string
): Result<string | undefined, NormalizeError> {
  const parser = new DOMParser();
  const document = parser.parseFromString(svgImageText, 'image/svg+xml');
  const svgNode = document.querySelector('svg');
  if (!svgNode) {
    return err({ code: 'invalidSvg' });
  }
  const imageNodes = svgNode.querySelectorAll('image');
  if (imageNodes.length > 1) {
    return err({ code: 'invalidSvg' });
  }
  if (imageNodes.length === 0) {
    return ok(undefined);
  }
  const [imageNode] = imageNodes;
  const href = imageNode.getAttribute('href');
  if (!href) {
    return err({ code: 'invalidSvg' });
  }
  return ok(href);
}

import { Buffer } from 'node:buffer';
import sanitizeHtml from 'sanitize-html';
import { FileInputButton, FileInputButtonProps, P } from '@votingworks/ui';
import { assert, assertDefined, err, ok, Result } from '@votingworks/basics';
import { useEffect, useState } from 'react';
import { safeParseNumber } from '@votingworks/types';

const MAX_IMAGE_UPLOAD_BYTES = 1 * 1000 * 1_000; // 1 MB

const ALLOWED_IMAGE_TYPES = ['image/svg+xml', 'image/png', 'image/jpeg'];

// Based on https://github.com/cure53/DOMPurify/blob/main/src/tags.js
const ALLOWED_SVG_TAGS = [
  'svg',
  'a',
  'altglyph',
  'altglyphdef',
  'altglyphitem',
  'animatecolor',
  'animatemotion',
  'animatetransform',
  'circle',
  'clippath',
  'defs',
  'desc',
  'ellipse',
  'filter',
  'font',
  'g',
  'glyph',
  'glyphref',
  'hkern',
  'image',
  'line',
  'lineargradient',
  'marker',
  'mask',
  'metadata',
  'mpath',
  'path',
  'pattern',
  'polygon',
  'polyline',
  'radialgradient',
  'rect',
  'stop',
  'switch',
  'symbol',
  'text',
  'textpath',
  'title',
  'tref',
  'tspan',
  'view',
  'vkern',
];

function sanitizeSvg(svg: string): string {
  return sanitizeHtml(svg, {
    allowedTags: ALLOWED_SVG_TAGS,
    allowedAttributes: false,
    allowedSchemes: ['data'],
    parser: {
      lowerCaseTags: false,
      lowerCaseAttributeNames: false,
    },
  });
}

async function loadSvgImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      /* istanbul ignore next */
      const contents = e.target?.result;
      assert(typeof contents === 'string');
      resolve(contents);
    };
    reader.readAsText(file);
  });
}

async function getBitmapImageDimensions(
  imageDataUrl: string
): Promise<{ width: number; height: number }> {
  const img = new Image();
  img.src = imageDataUrl;
  await img.decode();
  return { width: img.naturalWidth, height: img.naturalHeight };
}

async function bitmapImageToSvg(imageDataUrl: string) {
  const { width, height } = await getBitmapImageDimensions(imageDataUrl);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <image href="${imageDataUrl}" width="${width}" height="${height}" />
  </svg>`;
}

async function loadBitmapImageAndConvertToSvg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      /* istanbul ignore next */
      const imageDataUrl = e.target?.result;
      if (typeof imageDataUrl === 'string') {
        const svgContents = await bitmapImageToSvg(imageDataUrl);
        resolve(svgContents);
      }
      reject(new Error('Could not read file contents'));
    };
    reader.readAsDataURL(file);
  });
}

interface ImageInputButtonProps
  extends Pick<FileInputButtonProps, 'disabled' | 'buttonProps' | 'children'> {
  onChange: (svgImage: string) => void;
  onError: (error: Error) => void;
  required?: boolean;
  minWidthPx?: number;
  minHeightPx?: number;
}

function validateSvgDimensions(
  svgImage: string,
  minHeightPx?: number,
  minWidthPx?: number
): Result<void, Error> {
  if (!minHeightPx && !minWidthPx) {
    return ok();
  }

  const parser = new DOMParser();
  const scratchDoc = parser.parseFromString(svgImage, 'image/svg+xml');
  const svgElement = scratchDoc.documentElement;

  if (scratchDoc.querySelector('parsererror')) {
    return err(new Error('Invalid SVG content'));
  }

  let width = svgElement.getAttribute('width');
  let height = svgElement.getAttribute('height');

  // Ignore dimensions in non-px measurements
  const digitsAndPxOnly = /^\d*(\.\d+)?(px)?$/;
  if (!width?.match(digitsAndPxOnly)) {
    width = null;
  }
  if (!height?.match(digitsAndPxOnly)) {
    height = null;
  }

  // Infer dimensions from viewBox if pixel width/height not present
  if (width === null || height === null) {
    const viewBox = svgElement.getAttribute('viewBox');
    if (viewBox) {
      // The value of the viewBox attribute is a list of four numbers separated by whitespace and/or a comma: min-x, min-y, width, and height.
      const [, , viewBoxWidth, viewBoxHeight] = viewBox
        .replace(/,/g, '')
        .split(/\s+/);
      width = width || viewBoxWidth;
      height = height || viewBoxHeight;
    }
  }

  function parseDimension(dimension: string | null) {
    // Assume an SVG with no dimensions specified is infinitely scalable
    if (!dimension) {
      return Number.MAX_SAFE_INTEGER;
    }

    // Round because viewBox may specify floats as strings
    return Math.round(
      safeParseNumber(
        // Remove units from string
        dimension.replace(/[a-zA-Z]/g, '')
      ).unsafeUnwrap()
    );
  }

  const widthPx = parseDimension(width);
  const heightPx = parseDimension(height);

  if (minWidthPx && widthPx < minWidthPx) {
    return err(
      new Error(
        `Image width (${widthPx}px) is smaller than minimum (${minWidthPx}px).`
      )
    );
  }
  if (minHeightPx && heightPx < minHeightPx) {
    return err(
      new Error(
        `Image height (${heightPx}px) is smaller than minimum (${minHeightPx}px).`
      )
    );
  }

  return ok();
}

export function ImageInputButton({
  onChange,
  onError,
  minHeightPx,
  minWidthPx,
  ...props
}: ImageInputButtonProps): JSX.Element {
  return (
    <FileInputButton
      {...props}
      accept={ALLOWED_IMAGE_TYPES.join(',')}
      onChange={async (e) => {
        /* istanbul ignore next */
        const file = assertDefined(e.target.files?.[0]);
        if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
          onError(
            new Error(
              `Image file size must be less than ${
                MAX_IMAGE_UPLOAD_BYTES / 1_000 / 1_000
              } MB`
            )
          );
          return;
        }
        assert(ALLOWED_IMAGE_TYPES.includes(file.type));
        const svgImage =
          file.type === 'image/svg+xml'
            ? await loadSvgImage(file)
            : await loadBitmapImageAndConvertToSvg(file);

        const validateResult = validateSvgDimensions(
          svgImage,
          minHeightPx,
          minWidthPx
        );
        if (validateResult.isErr()) {
          onError(validateResult.err());
          return;
        }

        onChange(sanitizeSvg(svgImage));
      }}
    />
  );
}

export function ImageInput({
  value,
  onChange,
  buttonLabel,
  disabled,
  className,
  required,
  minWidthPx,
  minHeightPx,
}: {
  value?: string;
  onChange: (value: string) => void;
  buttonLabel: string;
  disabled?: boolean;
  className?: string;
  required?: boolean;
  minWidthPx?: number;
  minHeightPx?: number;
}): JSX.Element {
  const [error, setError] = useState<Error | undefined>(undefined);

  // Clear error if the parent component has stopped interacting with this one
  useEffect(() => {
    if (disabled) {
      setError(undefined);
    }
  }, [disabled]);

  function onError(e: Error) {
    setError(e);
  }

  function onSuccessfulImageUpload(newValue: string) {
    setError(undefined);
    onChange(newValue);
  }

  return (
    <div className={className}>
      {value && (
        <img
          src={`data:image/svg+xml;base64,${Buffer.from(value).toString(
            'base64'
          )}`}
          alt="Upload preview"
          style={{ marginBottom: '0.5rem' }}
        />
      )}
      {error && <P style={{ color: 'red' }}>{error.message}</P>}
      <ImageInputButton
        disabled={disabled}
        onChange={onSuccessfulImageUpload}
        onError={onError}
        required={value ? false : required}
        minWidthPx={minWidthPx}
        minHeightPx={minHeightPx}
      >
        {buttonLabel}
      </ImageInputButton>
    </div>
  );
}

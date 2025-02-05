import { Buffer } from 'node:buffer';
import sanitizeHtml from 'sanitize-html';
import {
  Button,
  Callout,
  FileInputButton,
  FileInputButtonProps,
} from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import { useEffect, useRef, useState } from 'react';

const MAX_IMAGE_UPLOAD_BYTES = 5 * 1_000 * 1_000; // 5 MB

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

interface SvgImageWithMetadata {
  svgImage: string;
  width: number;
  height: number;
}

async function bitmapImageToSvg(
  imageDataUrl: string
): Promise<SvgImageWithMetadata> {
  const { width, height } = await getBitmapImageDimensions(imageDataUrl);
  return {
    width,
    height,
    svgImage: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <image href="${imageDataUrl}" width="${width}" height="${height}" />
  </svg>`,
  };
}

async function loadBitmapImageAndConvertToSvg(
  file: File
): Promise<SvgImageWithMetadata> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      /* istanbul ignore next */
      const imageDataUrl = e.target?.result;
      if (typeof imageDataUrl === 'string') {
        resolve(await bitmapImageToSvg(imageDataUrl));
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

export function ImageInputButton({
  onChange,
  onError,
  minHeightPx,
  minWidthPx,
  ...props
}: ImageInputButtonProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <FileInputButton
      {...props}
      accept={ALLOWED_IMAGE_TYPES.join(',')}
      onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file) {
          return;
        }
        let imageValidationError;
        /* istanbul ignore next */
        if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
          imageValidationError = new Error(
            `Image file size must be less than ${
              MAX_IMAGE_UPLOAD_BYTES / 1_000 / 1_000
            } MB`
          );
        }
        assert(ALLOWED_IMAGE_TYPES.includes(file.type));
        let svgImage: string;
        if (file.type === 'image/svg+xml') {
          svgImage = await loadSvgImage(file);
        } else {
          const svgWithMeta = await loadBitmapImageAndConvertToSvg(file);
          const { width, height } = svgWithMeta;

          // Validate dimensions against minimums if provided
          if (minWidthPx && width < minWidthPx) {
            imageValidationError = new Error(
              `Image width (${width}px) is smaller than minimum (${minWidthPx}px).`
            );
          } else if (minHeightPx && height < minHeightPx) {
            imageValidationError = new Error(
              `Image height (${height}px) is smaller than minimum (${minHeightPx}px).`
            );
          }

          if (imageValidationError) {
            onError(imageValidationError);
            inputRef.current?.setCustomValidity(imageValidationError.message);
            return;
          }

          svgImage = svgWithMeta.svgImage;
        }

        inputRef.current?.setCustomValidity('');

        onChange(sanitizeSvg(svgImage));
      }}
      innerRef={inputRef}
    />
  );
}

export interface ImageInputProps {
  value?: string;
  onChange: (value?: string) => void;
  buttonLabel: string;
  removeButtonLabel: string;
  disabled?: boolean;
  className?: string;
  required?: boolean;
  minWidthPx?: number;
  minHeightPx?: number;
}

export function ImageInput({
  value,
  onChange,
  buttonLabel,
  removeButtonLabel,
  disabled,
  className,
  required,
  minWidthPx,
  minHeightPx,
}: ImageInputProps): JSX.Element {
  const [error, setError] = useState<Error>();

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
      {error && (
        <Callout
          style={{ marginBottom: '0.5rem' }}
          icon="Warning"
          color="warning"
        >
          {error.message}
        </Callout>
      )}
      {value && !required ? (
        <Button
          onPress={() => onChange(undefined)}
          disabled={disabled}
          variant="danger"
          fill="outlined"
        >
          {removeButtonLabel}
        </Button>
      ) : (
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
      )}
    </div>
  );
}

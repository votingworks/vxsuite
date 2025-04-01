import * as Sentry from '@sentry/browser';
import { Buffer } from 'node:buffer';
import sanitizeHtml from 'sanitize-html';
import {
  Button,
  Callout,
  FileInputButton,
  FileInputButtonProps,
  images,
} from '@votingworks/ui';
import {
  assert,
  err,
  ok,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import React, { useEffect, useRef, useState } from 'react';

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

// [TODO] Move to server-side.
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
      /* istanbul ignore next - @preserve */
      const contents = e.target?.result;
      assert(typeof contents === 'string');
      resolve(contents);
    };
    reader.readAsText(file);
  });
}

interface SvgImageWithMetadata {
  svgImage: string;
  width: number;
  height: number;
}

function bitmapImageToSvg(img: images.NormalizedImage): SvgImageWithMetadata {
  const { dataUrl: imageDataUrl, heightPx: height, widthPx: width } = img;

  return {
    width,
    height,
    svgImage: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <image href="${imageDataUrl}" width="${width}" height="${height}" />
  </svg>`,
  };
}

type NormalizeToSvgResult = Result<SvgImageWithMetadata, images.NormalizeError>;

async function normalizeToSvg(
  file: File,
  params: images.NormalizeParams
): Promise<NormalizeToSvgResult> {
  const normalizeResult = await images.normalizeFile(file, params);
  if (normalizeResult.isErr()) {
    return normalizeResult;
  }

  return ok(bitmapImageToSvg(normalizeResult.ok()));
}

interface ImageInputButtonProps
  extends Pick<FileInputButtonProps, 'disabled' | 'buttonProps' | 'children'> {
  onChange: (svgImage: string) => void;
  onError: (error: Error) => void;
  required?: boolean;
  normalizeParams: images.NormalizeParams;
}

export function ImageInputButton({
  onChange,
  onError,
  normalizeParams,
  ...props
}: ImageInputButtonProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleError(msg: string) {
    onError(new Error(msg));
    inputRef.current?.setCustomValidity(msg);
  }

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    inputRef.current?.setCustomValidity('');

    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      return handleError(
        `Image file size must be less than ${
          MAX_IMAGE_UPLOAD_BYTES / 1_000 / 1_000
        } MB`
      );
    }

    if (file.type === 'image/svg+xml') {
      return onChange(sanitizeSvg(await loadSvgImage(file)));
    }

    let svgResult: NormalizeToSvgResult;
    try {
      svgResult = await normalizeToSvg(file, normalizeParams);
    } catch (error) {
      svgResult = err({ code: 'unexpected', error });
    }

    if (svgResult.isErr()) {
      const error = svgResult.err();

      switch (error.code) {
        case 'belowMinHeight':
          return handleError(
            `Image height (${error.heightPx}px) is smaller than minimum ` +
              `(${normalizeParams.minHeightPx}px).`
          );

        case 'belowMinWidth':
          return handleError(
            `Image width (${error.widthPx}px) is smaller than minimum ` +
              `(${normalizeParams.minWidthPx}px).`
          );

        case 'unsupportedImageType':
          return handleError(
            'This image type is not supported. Please try uploading a file ' +
              'with one of the following extensions: .jpg, .jpeg, .png, .svg'
          );

        case 'unexpected': {
          Sentry.captureException(error.error, {
            tags: { action: 'normalizeToSvg' },
          });

          return handleError(
            'Something went wrong. Please refresh the page and try again.'
          );
        }

        default:
          throwIllegalValue(error, 'code');
      }
    }

    onChange(sanitizeSvg(svgResult.ok().svgImage));
  }

  return (
    <FileInputButton
      {...props}
      accept={ALLOWED_IMAGE_TYPES.join(',')}
      onChange={handleChange}
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
  normalizeParams: images.NormalizeParams;
}

export function ImageInput({
  value,
  onChange,
  buttonLabel,
  removeButtonLabel,
  disabled,
  className,
  required,
  normalizeParams,
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

  function onRemoveButtonClick() {
    // Prevent the button underlying <input> from also being clicked, which
    // would trigger a file selection dialog immediately after the remove button
    // is clicked.
    setTimeout(() => {
      onChange(undefined);
    }, 0);
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
          onPress={onRemoveButtonClick}
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
          normalizeParams={normalizeParams}
        >
          {buttonLabel}
        </ImageInputButton>
      )}
    </div>
  );
}

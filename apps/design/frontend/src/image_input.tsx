import * as Sentry from '@sentry/browser';
import { Buffer } from 'node:buffer';
import sanitizeHtml from 'sanitize-html';
import {
  Button,
  Callout,
  FileInputButton,
  FileInputButtonProps,
} from '@votingworks/ui';
import { throwIllegalValue } from '@votingworks/basics';
import React, { useEffect, useRef, useState } from 'react';
import { NormalizeParams, normalizeImageToSvg } from './image_normalization';

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

interface ImageInputButtonProps
  extends Pick<FileInputButtonProps, 'disabled' | 'buttonProps' | 'children'> {
  onChange: (svgImage: string) => void;
  onError: (error: Error) => void;
  required?: boolean;
  normalizeParams: NormalizeParams;
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

    const svgResult = await normalizeImageToSvg(file, normalizeParams);

    if (svgResult.isErr()) {
      const error = svgResult.err();

      switch (error.code) {
        case 'invalidSvg':
          return handleError('This image is not a valid SVG.');

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

        default: {
          /* istanbul ignore next - @preserve */
          throwIllegalValue(error, 'code');
        }
      }
    }

    onChange(sanitizeSvg(svgResult.ok()));
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
  normalizeParams: NormalizeParams;
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

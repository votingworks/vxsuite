import { Buffer } from 'node:buffer';
import sanitizeHtml from 'sanitize-html';
import { FileInputButton, FileInputButtonProps } from '@votingworks/ui';
import { assert, assertDefined } from '@votingworks/basics';

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
      /* istanbul ignore next - @preserve */
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
      /* istanbul ignore next - @preserve */
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
}

export function ImageInputButton({
  onChange,
  ...props
}: ImageInputButtonProps): JSX.Element {
  return (
    <FileInputButton
      {...props}
      accept={ALLOWED_IMAGE_TYPES.join(',')}
      onChange={async (e) => {
        try {
          /* istanbul ignore next - @preserve */
          const file = assertDefined(e.target.files?.[0]);
          if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
            throw new Error(
              `Image file size must be less than ${
                MAX_IMAGE_UPLOAD_BYTES / 1_000 / 1_000
              } MB`
            );
          }
          assert(ALLOWED_IMAGE_TYPES.includes(file.type));
          const svgImage =
            file.type === 'image/svg+xml'
              ? await loadSvgImage(file)
              : await loadBitmapImageAndConvertToSvg(file);
          onChange(sanitizeSvg(svgImage));
        } catch (error) {
          // TODO handle errors and show to user when we do form validation
          // eslint-disable-next-line no-console
          console.error(error);
        }
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
}: {
  value?: string;
  onChange: (value: string) => void;
  buttonLabel: string;
  disabled?: boolean;
  className?: string;
}): JSX.Element {
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
      <ImageInputButton disabled={disabled} onChange={onChange}>
        {buttonLabel}
      </ImageInputButton>
    </div>
  );
}

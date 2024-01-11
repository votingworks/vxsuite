import { Buffer } from 'buffer';
import DomPurify from 'dompurify';
import { FileInputButton } from '@votingworks/ui';
import { assert, assertDefined } from '@votingworks/basics';

const MAX_IMAGE_UPLOAD_BYTES = 5 * 1_000 * 1_000; // 5 MB

const ALLOWED_IMAGE_TYPES = ['image/svg+xml', 'image/png', 'image/jpeg'];

async function loadSvgImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      /* istanbul ignore next */
      const contents = e.target?.result;
      if (typeof contents === 'string') {
        resolve(contents);
      }
      reject(new Error('Could not read file contents'));
    };
    reader.readAsText(file);
  });
}

async function getBitmapImageDimensions(
  imageDataUrl: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = imageDataUrl;
  });
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
      <FileInputButton
        disabled={disabled}
        accept={ALLOWED_IMAGE_TYPES.join(',')}
        onChange={async (e) => {
          try {
            /* istanbul ignore next */
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
            const sanitizedSvg = DomPurify.sanitize(svgImage, {
              USE_PROFILES: { svg: true },
            });
            onChange(sanitizedSvg);
          } catch (error) {
            // TODO handle errors and show to user when we do form validation
            // eslint-disable-next-line no-console
            console.error(error);
          }
        }}
      >
        {buttonLabel}
      </FileInputButton>
    </div>
  );
}

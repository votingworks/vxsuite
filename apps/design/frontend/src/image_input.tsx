import { Buffer } from 'buffer';
import DomPurify from 'dompurify';
import { FileInputButton } from '@votingworks/ui';

const MAX_SVG_UPLOAD_BYTES = 5 * 1_000 * 1_000; // 5 MB

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
        accept="image/svg+xml"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > MAX_SVG_UPLOAD_BYTES) {
            throw new Error(
              `Image file size must be less than ${
                MAX_SVG_UPLOAD_BYTES / 1_000 / 1_000
              } MB`
            );
          }
          const reader = new FileReader();
          reader.onload = (e2) => {
            const svgContents = e2.target?.result;
            if (typeof svgContents === 'string') {
              const image = DomPurify.sanitize(svgContents, {
                USE_PROFILES: { svg: true },
              });
              onChange(image);
            }
          };
          reader.readAsText(file);
        }}
      >
        {buttonLabel}
      </FileInputButton>
    </div>
  );
}

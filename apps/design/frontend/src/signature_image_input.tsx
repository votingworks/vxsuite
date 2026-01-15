import styled from 'styled-components';
import { ImageInput, ImageInputProps } from './image_input';
import { NormalizeParams } from './image_normalization';

const StyledImageInput = styled(ImageInput)`
  img {
    width: 10rem;
  }
`;

type StaticPropsNames =
  | 'normalizeParams'
  | 'minWidthPx'
  | 'minHeightPx'
  | 'buttonLabel'
  | 'removeButtonLabel';

export type SignatureImageInputProps = Omit<ImageInputProps, StaticPropsNames>;

const PDF_PIXELS_PER_INCH = 96;
const LETTER_PAGE_WIDTH_INCHES = 8.5;

/** Generously padded. */
const LETTER_PAGE_CONTENT_WIDTH_INCHES = LETTER_PAGE_WIDTH_INCHES - 2;

const SIGNATURE_IMAGE_NORMALIZE_PARAMS: Readonly<NormalizeParams> = {
  maxHeightPx: 1 * PDF_PIXELS_PER_INCH,
  maxWidthPx: 0.5 * LETTER_PAGE_CONTENT_WIDTH_INCHES * PDF_PIXELS_PER_INCH,
  minHeightPx: 50,
  minWidthPx: 100,
};

export function SignatureImageInput(
  props: SignatureImageInputProps
): JSX.Element {
  return (
    <StyledImageInput
      {...props}
      buttonLabel="Upload Signature Image"
      removeButtonLabel="Remove Signature Image"
      normalizeParams={SIGNATURE_IMAGE_NORMALIZE_PARAMS}
    />
  );
}

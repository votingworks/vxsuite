import styled from 'styled-components';
import { ImageInput, ImageInputProps } from './image_input';

const StyledImageInput = styled(ImageInput)`
  img {
    width: 10rem;
  }
`;

type PropsWithDefaults =
  | 'minWidthPx'
  | 'minHeightPx'
  | 'buttonLabel'
  | 'removeButtonLabel';

export type SealImageInputProps = Omit<ImageInputProps, PropsWithDefaults> & {
  [K in PropsWithDefaults]?: ImageInputProps[K];
};

export function SealImageInput({
  minWidthPx = 200,
  minHeightPx = 200,
  buttonLabel = 'Upload Seal Image',
  removeButtonLabel = 'Remove Seal Image',
  ...rest
}: SealImageInputProps): JSX.Element {
  return (
    <StyledImageInput
      {...rest}
      minWidthPx={minWidthPx}
      minHeightPx={minHeightPx}
      buttonLabel={buttonLabel}
      removeButtonLabel={removeButtonLabel}
    />
  );
}

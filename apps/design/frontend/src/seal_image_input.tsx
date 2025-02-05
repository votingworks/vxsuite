import styled from 'styled-components';
import { ImageInput, ImageInputProps } from './image_input';

const StyledImageInput = styled(ImageInput)`
  img {
    width: 10rem;
  }
`;

type StaticPropsNames =
  | 'minWidthPx'
  | 'minHeightPx'
  | 'buttonLabel'
  | 'removeButtonLabel';

export type SealImageInputProps = Omit<ImageInputProps, StaticPropsNames>;

export function SealImageInput(props: SealImageInputProps): JSX.Element {
  return (
    <StyledImageInput
      {...props}
      minWidthPx={200}
      minHeightPx={200}
      buttonLabel="Upload Seal Image"
      removeButtonLabel="Remove Seal Image"
    />
  );
}

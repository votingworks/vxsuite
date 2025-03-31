import styled from 'styled-components';
import { images } from '@votingworks/ui';
import { ImageInput, ImageInputProps } from './image_input';

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

export type SealImageInputProps = Omit<ImageInputProps, StaticPropsNames>;

const VXMARK_MAX_SEAL_DISPLAY_SIZE_REM = 7;
const VXMARK_DEFAULT_FONT_SIZE_PX = 40;
const VXMARK_MAX_FONT_SIZE_PX = 70;

const MIN_SEAL_SIZE_PX =
  VXMARK_MAX_SEAL_DISPLAY_SIZE_REM * VXMARK_DEFAULT_FONT_SIZE_PX;

const MAX_SEAL_SIZE_PX =
  VXMARK_MAX_SEAL_DISPLAY_SIZE_REM * VXMARK_MAX_FONT_SIZE_PX;

const NORMALIZE_PARAMS: Readonly<images.NormalizeParams> = {
  maxHeightPx: MAX_SEAL_SIZE_PX,
  maxWidthPx: MAX_SEAL_SIZE_PX,
  minHeightPx: MIN_SEAL_SIZE_PX,
  minWidthPx: MIN_SEAL_SIZE_PX,
};

export function SealImageInput(props: SealImageInputProps): JSX.Element {
  return (
    <StyledImageInput
      {...props}
      normalizeParams={NORMALIZE_PARAMS}
      buttonLabel="Upload Seal Image"
      removeButtonLabel="Remove Seal Image"
    />
  );
}

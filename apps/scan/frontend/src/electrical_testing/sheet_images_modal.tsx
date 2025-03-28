import { SheetOf } from '@votingworks/types';
import { Modal } from '@votingworks/ui';
import styled from 'styled-components';

export interface Props {
  paths: SheetOf<string>;
  onClose: () => void;
}

const SheetImage = styled.img`
  max-width: 50%;
`;

/**
 * Renders a modal showing images for a scanned sheet.
 */
export function SheetImagesModal({ paths, onClose }: Props): JSX.Element {
  return (
    <Modal
      onOverlayClick={onClose}
      content={
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
          }}
          role="presentation"
          onClick={onClose}
        >
          <SheetImage src={paths[0]} alt="Front Sheet" />
          <SheetImage src={paths[1]} alt="Back Sheet" />
        </div>
      }
    />
  );
}

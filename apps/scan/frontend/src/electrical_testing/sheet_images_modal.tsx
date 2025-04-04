import { SheetOf } from '@votingworks/types';
import { Icons, Modal } from '@votingworks/ui';
import styled from 'styled-components';

export interface Props {
  paths: SheetOf<string>;
  onClose: () => void;
}

const SheetImage = styled.img`
  max-width: 50%;
`;

function CloseButton({ onPress }: { onPress: () => void }) {
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      role="button"
      tabIndex={-1}
      onClick={onPress}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        background: 'white',
        borderRadius: '50%',
        boxShadow: '0 0px 5px 3px rgba(255, 255, 255, 1)',
        transform: 'translate(25%, -25%)',
      }}
    >
      <Icons.Delete />
    </div>
  );
}

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
            position: 'relative',
          }}
          role="presentation"
          onClick={onClose}
        >
          <CloseButton onPress={onClose} />
          <SheetImage src={paths[0]} alt="Front Sheet" />
          <SheetImage src={paths[1]} alt="Back Sheet" />
        </div>
      }
    />
  );
}

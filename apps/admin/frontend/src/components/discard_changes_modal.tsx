import { Button, Modal } from '@votingworks/ui';
import React from 'react';
import styled from 'styled-components';

const EqualWidthButton = styled(Button)`
  flex: 1 1 0;
`;

export function DiscardChangesModal({
  onBack,
  onDiscard,
}: {
  onBack: () => void;
  onDiscard: () => void;
}): JSX.Element {
  return (
    <Modal
      title="Unsaved Changes"
      content="Your adjudications for this ballot have not been saved."
      actions={
        <React.Fragment>
          <EqualWidthButton variant="danger" onPress={onDiscard} autoFocus>
            Discard Changes
          </EqualWidthButton>
          <EqualWidthButton variant="neutral" onPress={onBack}>
            Back
          </EqualWidthButton>
        </React.Fragment>
      }
    />
  );
}

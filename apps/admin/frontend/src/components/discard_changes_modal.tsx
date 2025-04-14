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
  const content = 'Your adjudications for this ballot have not been saved.';

  return (
    <Modal
      title="Unsaved Changes"
      content={content}
      actions={
        <React.Fragment>
          <EqualWidthButton variant="danger" onPress={onDiscard}>
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

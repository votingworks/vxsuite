import { Button, Modal } from '@votingworks/ui';
import React, { useEffect } from 'react';
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
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Enter') {
        onDiscard();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDiscard]);
  return (
    <Modal
      title="Unsaved Changes"
      content="Your adjudications for this ballot have not been saved."
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

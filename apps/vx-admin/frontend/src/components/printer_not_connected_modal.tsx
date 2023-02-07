import React from 'react';
import { Button, Modal, Prose } from '@votingworks/ui';

interface Props {
  onClose: VoidFunction;
}

export function PrinterNotConnectedModal({ onClose }: Props): JSX.Element {
  return (
    <Modal
      content={
        <Prose>
          <h2>The printer is not connected.</h2>
          <p>Please connect the printer and try again.</p>
        </Prose>
      }
      actions={<Button onPress={onClose}>Okay</Button>}
    />
  );
}

import React from 'react';
import { Button, Modal } from '@votingworks/ui';

interface Props {
  onClose: VoidFunction;
}

export function PrinterNotConnectedModal({ onClose }: Props): JSX.Element {
  return (
    <Modal
      title="The printer is not connected."
      content={<p>Please connect the printer and try again.</p>}
      actions={<Button onPress={onClose}>Okay</Button>}
    />
  );
}

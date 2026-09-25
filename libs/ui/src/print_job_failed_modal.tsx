import React from 'react';
import { Button } from './button.js';
import { Modal } from './modal.js';
import { P } from './typography.js';

export interface PrintJobFailedModalProps {
  multipleBallotsAttempted: boolean;
  reason?: string;
  onClose: () => void;
}

export function PrintJobFailedModal({
  multipleBallotsAttempted,
  reason,
  onClose,
}: PrintJobFailedModalProps): JSX.Element {
  return (
    <Modal
      title={
        multipleBallotsAttempted ? 'Ballots Not Printed' : 'Ballot Not Printed'
      }
      content={
        <React.Fragment>
          <P>
            {multipleBallotsAttempted
              ? 'The ballots were not sent to the printer.'
              : 'The ballot was not sent to the printer.'}
          </P>
          {reason && <P>{reason}</P>}
        </React.Fragment>
      }
      actions={<Button onPress={onClose}>Close</Button>}
    />
  );
}

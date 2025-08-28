import React from 'react';
import { DiagnosticOutcome } from '@votingworks/types';
import { Modal } from '../modal';
import { Button } from '../button';
import { P } from '../typography';

export interface UpsDiagnosticModalProps {
  setVisible: (visible: boolean) => void;
  logOutcome: (input: { outcome: DiagnosticOutcome }) => void;
  isLoading: boolean;
}

export function UpsDiagnosticModal(
  props: UpsDiagnosticModalProps
): JSX.Element {
  const { setVisible, logOutcome, isLoading } = props;

  function onConfirm(outcome: DiagnosticOutcome) {
    logOutcome({ outcome });
    setVisible(false);
  }

  return (
    <Modal
      actions={
        <React.Fragment>
          <Button
            disabled={isLoading}
            onPress={onConfirm}
            value="pass"
            variant="primary"
          >
            Yes
          </Button>
          <Button disabled={isLoading} onPress={onConfirm} value="fail">
            No
          </Button>
        </React.Fragment>
      }
      content={
        <P>Is the uninterruptible power supply connected and fully charged?</P>
      }
      title={<React.Fragment>Uninterruptible Power Supply</React.Fragment>}
    />
  );
}

interface UpsDiagnosticModalButtonProps {
  logOutcome: (input: { outcome: DiagnosticOutcome }) => void;
  isLoading: boolean;
}

export function UpsDiagnosticModalButton(
  props: UpsDiagnosticModalButtonProps
): JSX.Element {
  const [modalVisible, setModalVisible] = React.useState<boolean>();
  const { logOutcome, isLoading } = props;

  return (
    <div>
      <Button onPress={setModalVisible} value={!modalVisible}>
        Test Uninterruptible Power Supply
      </Button>

      {modalVisible && (
        <UpsDiagnosticModal
          setVisible={setModalVisible}
          logOutcome={logOutcome}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}

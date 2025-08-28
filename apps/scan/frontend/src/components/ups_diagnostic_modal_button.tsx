import React from 'react';
import { DiagnosticOutcome } from '@votingworks/types';
import { Button, Modal, P } from '@votingworks/ui';
import * as api from '../api';

export interface UpsDiagnosticModalProps {
  setVisible: (visible: boolean) => void;
}

export function UpsDiagnosticModal(
  props: UpsDiagnosticModalProps
): JSX.Element {
  const { setVisible } = props;

  const { isLoading, mutate: logOutcome } =
    api.logUpsDiagnosticOutcome.useMutation();

  function onConfirm(outcome: DiagnosticOutcome) {
    console.log('onConfirm clicked');
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

export function UpsDiagnosticModalButton(): JSX.Element {
  const [modalVisible, setModalVisible] = React.useState<boolean>();

  return (
    <div>
      <Button onPress={setModalVisible} value={!modalVisible}>
        Test Uninterruptible Power Supply
      </Button>

      {modalVisible && <UpsDiagnosticModal setVisible={setModalVisible} />}
    </div>
  );
}

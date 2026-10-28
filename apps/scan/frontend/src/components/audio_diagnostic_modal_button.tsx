import React from 'react';
import type { DiagnosticOutcome } from '@votingworks/types';
import { Button, Icons, Modal, P } from '@votingworks/ui';
import * as api from '../api.js';

export interface AudioDiagnosticModalProps {
  setVisible: (visible: boolean) => void;
}

export function AudioDiagnosticModal(
  props: AudioDiagnosticModalProps
): JSX.Element {
  const { setVisible } = props;

  const { isLoading, mutate: logOutcome } =
    api.logAudioDiagnosticOutcome.useMutation();

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
      content={<P>Did you hear the sound played over the speakers?</P>}
      title={
        <React.Fragment>
          Sound Test <Icons.SoundOn />
        </React.Fragment>
      }
    />
  );
}

export function AudioDiagnosticModalButton(): JSX.Element {
  const [modalVisible, setModalVisible] = React.useState<boolean>();
  const playSound = api.playSound.useMutation().mutate;

  function onPress() {
    playSound({ name: 'success' });
    setModalVisible(true);
  }

  return (
    <div>
      <Button rightIcon="SoundOn" onPress={onPress}>
        Test Sound
      </Button>

      {modalVisible && <AudioDiagnosticModal setVisible={setModalVisible} />}
    </div>
  );
}

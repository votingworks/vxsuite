import React from 'react';
import { DiagnosticOutcome } from '@votingworks/types';
import { Button, Icons, Modal, P } from '@votingworks/ui';
import { useSound } from '../utils/use_sound';
import * as api from '../api';

export interface AudioDiagnosticModalProps {
  setVisible: (visible: boolean) => void;
}

export function AudioDiagnosticModal(
  props: AudioDiagnosticModalProps
): JSX.Element {
  const { setVisible } = props;
  const playSound = useSound('success');
  React.useEffect(playSound, [playSound]);

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
      onOverlayClick={close}
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

  return (
    <div>
      <Button
        rightIcon="SoundOn"
        onPress={setModalVisible}
        value={!modalVisible}
      >
        Test Sound
      </Button>

      {modalVisible && <AudioDiagnosticModal setVisible={setModalVisible} />}
    </div>
  );
}

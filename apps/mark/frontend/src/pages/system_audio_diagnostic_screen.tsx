import { Button, ButtonBar, H2, Main, P, Screen } from '@votingworks/ui';
import { addDiagnosticRecord, playSound } from '../api';

interface SystemAudioDiagnosticScreenProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function SystemAudioDiagnosticScreen({
  onComplete,
  onCancel,
}: SystemAudioDiagnosticScreenProps): JSX.Element {
  const addDiagnosticRecordMutation = addDiagnosticRecord.useMutation();
  const playSoundMutation = playSound.useMutation();

  function passTest() {
    addDiagnosticRecordMutation.mutate({
      type: 'mark-system-audio',
      outcome: 'pass',
    });
    onComplete();
  }

  function failTest() {
    addDiagnosticRecordMutation.mutate({
      type: 'mark-system-audio',
      outcome: 'fail',
    });
    onComplete();
  }

  function handlePlayAudio() {
    playSoundMutation.mutate({ name: 'chime' });
  }

  return (
    <Screen>
      <Main flexColumn padded>
        <H2>System Audio Test</H2>
        <P>Press the button below to play audio through the system speakers.</P>
        {playSoundMutation.isLoading ? (
          <Button
            disabled
            icon="SoundOn"
            onPress={
              /* istanbul ignore next - @preserve */
              () => {}
            }
          >
            Audio is Playing
          </Button>
        ) : (
          <Button icon="Play" onPress={handlePlayAudio}>
            Play Audio
          </Button>
        )}
        <ButtonBar style={{ marginTop: '0.5rem' }}>
          <Button icon="Done" onPress={passTest}>
            Sound Is Audible
          </Button>
          <Button icon="Delete" onPress={failTest}>
            Sound Is Not Audible
          </Button>
        </ButtonBar>
        <P style={{ marginTop: '1rem' }}>
          <Button onPress={onCancel}>Cancel Test</Button>
        </P>
      </Main>
    </Screen>
  );
}

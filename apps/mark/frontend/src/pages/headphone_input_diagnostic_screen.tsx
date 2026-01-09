import { Button, ButtonBar, H2, Main, P, Screen } from '@votingworks/ui';
import { useRef, useState } from 'react';
import { addDiagnosticRecord } from '../api';

interface HeadphoneInputDiagnosticScreenProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function HeadphoneInputDiagnosticScreen({
  onComplete,
  onCancel,
}: HeadphoneInputDiagnosticScreenProps): JSX.Element {
  const audioRef = useRef<HTMLAudioElement>(new Audio('/sounds/chime.wav'));
  const [audioIsPlaying, setAudioIsPlaying] = useState(false);
  const addDiagnosticRecordMutation = addDiagnosticRecord.useMutation();

  function passTest() {
    addDiagnosticRecordMutation.mutate({
      type: 'mark-headphone-input',
      outcome: 'pass',
    });
    onComplete();
  }

  function failTest() {
    addDiagnosticRecordMutation.mutate({
      type: 'mark-headphone-input',
      outcome: 'fail',
    });
    onComplete();
  }

  function handlePlay() {
    setAudioIsPlaying(true);
  }

  function handleEnded() {
    setAudioIsPlaying(false);
  }

  return (
    <Screen>
      <Main flexColumn padded>
        <H2>Headphone Input Test</H2>
        {/* The following rule is disabled because the audio has no words. */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio
          data-testid="headphone-diagnostic-audio"
          ref={audioRef}
          onPlay={handlePlay}
          onEnded={handleEnded}
        >
          <source src="/sounds/chime.wav" type="audio/wav" />
        </audio>
        <P>
          Connect headphones to the headphone input and press the button below
          to play audio.
        </P>
        {audioIsPlaying ? (
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
          <Button
            icon="Play"
            onPress={async () => await audioRef.current.play()}
          >
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

import { Button, ButtonBar, H2, Main, P, Screen } from '@votingworks/ui';
import { useRef, useState } from 'react';
import { addDiagnosticRecord } from '../../api';

interface HeadphoneInputDiagnosticScreenProps {
  onClose: () => void;
}

export function HeadphoneInputDiagnosticScreen({
  onClose,
}: HeadphoneInputDiagnosticScreenProps): JSX.Element {
  const audioRef = useRef<HTMLAudioElement>(new Audio('./assets/chime.wav'));
  const [audioIsPlaying, setAudioIsPlaying] = useState(false);
  const addDiagnosticRecordMutation = addDiagnosticRecord.useMutation(
    'mark-scan-headphone-input'
  );

  function passTest() {
    addDiagnosticRecordMutation.mutate({
      type: 'mark-scan-headphone-input',
      outcome: 'pass',
    });
    onClose();
  }

  function failTest() {
    addDiagnosticRecordMutation.mutate({
      type: 'mark-scan-headphone-input',
      outcome: 'fail',
    });
    onClose();
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
        <H2>Front Headphone Input Test</H2>
        {/* The following rule is disabled because the audio has no words. */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio
          data-testid="headphone-diagnostic-audio"
          ref={audioRef}
          onPlay={handlePlay}
          onEnded={handleEnded}
        >
          <source src="./assets/chime.wav" type="audio/wav" />
        </audio>
        <P>
          Connect headphones to the front headphone input and press the button
          below to play audio.
        </P>
        {audioIsPlaying ? (
          <Button
            disabled
            icon="SoundOn"
            onPress={
              /* istanbul ignore next */
              () => {}
            }
          >
            Audio is playing
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
            Sound is Audible
          </Button>
          <Button icon="Delete" onPress={failTest}>
            Sound is Not Audible
          </Button>
        </ButtonBar>
      </Main>
    </Screen>
  );
}

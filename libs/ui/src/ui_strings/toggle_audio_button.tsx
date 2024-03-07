import React from 'react';
import { Button } from '../button';
import { P } from '../typography';
import { useAudioControls } from '../hooks/use_audio_controls';
import { useAudioContext } from './audio_context';
import { Icons } from '../icons';
import { appStrings } from './app_strings';
import { WithAltAudio } from './with_alt_audio';

export function ToggleAudioButton(): React.ReactNode {
  const isAudioEnabled = useAudioContext()?.isEnabled || false;
  const audioControls = useAudioControls();

  const statusText = isAudioEnabled ? (
    <React.Fragment>
      <Icons.SoundOn /> {appStrings.noteVoterSettingsAudioUnmuted()}
    </React.Fragment>
  ) : (
    <React.Fragment>
      <Icons.SoundOff /> {appStrings.noteVoterSettingsAudioMuted()}
    </React.Fragment>
  );

  return (
    <div>
      <P weight="bold">{statusText}</P>
      <Button onPress={audioControls.toggleEnabled}>
        <WithAltAudio
          audioText={
            <React.Fragment>
              {statusText} {appStrings.instructionsAudioMuteButton()}
            </React.Fragment>
          }
        >
          {isAudioEnabled
            ? appStrings.buttonAudioMute()
            : appStrings.buttonAudioUnmute()}
        </WithAltAudio>
      </Button>
    </div>
  );
}

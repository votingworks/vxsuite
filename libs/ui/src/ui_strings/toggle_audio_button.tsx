import React from 'react';
import { Button } from '../button';
import { P } from '../typography';
import { useAudioControls } from '../hooks/use_audio_controls';
import { Icons } from '../icons';
import { appStrings } from './app_strings';
import { WithAltAudio } from './with_alt_audio';
import { useAudioEnabled } from '../hooks/use_audio_enabled';
import { useHeadphonesPluggedIn } from '../hooks/use_headphones_plugged_in';

export function ToggleAudioButton(): React.ReactNode {
  const isAudioEnabled = useAudioEnabled();
  const headphonesPluggedIn = useHeadphonesPluggedIn();
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
      <Button
        disabled={!headphonesPluggedIn}
        onPress={audioControls.toggleEnabled}
      >
        <WithAltAudio
          audioText={
            <React.Fragment>
              {statusText} {appStrings.instructionsAudioMuteButton()}
            </React.Fragment>
          }
        >
          {headphonesPluggedIn
            ? isAudioEnabled
              ? appStrings.buttonAudioMute()
              : appStrings.buttonAudioUnmute()
            : appStrings.noteVoterSettingsAudioNoHeadphones()}
        </WithAltAudio>
      </Button>
    </div>
  );
}

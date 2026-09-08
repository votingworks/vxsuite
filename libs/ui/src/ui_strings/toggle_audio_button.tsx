import React from 'react';
import { Button } from '../button.js';
import { P } from '../typography.js';
import { useAudioControls } from '../hooks/use_audio_controls.js';
import { Icons } from '../icons.js';
import { appStrings } from './app_strings.js';
import { WithAltAudio } from './with_alt_audio.js';
import { useAudioEnabled } from '../hooks/use_audio_enabled.js';
import { useHeadphonesPluggedIn } from '../hooks/use_headphones_plugged_in.js';

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

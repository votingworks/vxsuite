import styled from 'styled-components';
import React from 'react';
import { SettingsPane } from './settings_pane';
import { Button } from '../button';
import { VoterSettingsManagerContext } from '../voter_settings_manager_context';
import { appStrings, ToggleAudioButton } from '../ui_strings';
import { useAudioControls } from '../hooks/use_audio_controls';
import { useCurrentTheme } from '../hooks/use_current_theme';

const Buttons = styled.div`
  align-items: start;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

export interface AudioSettingsProps {
  onEnterAudioOnlyMode: () => void;
}

export function AudioSettings(props: AudioSettingsProps): JSX.Element {
  const { onEnterAudioOnlyMode } = props;
  const { setIsVisualModeDisabled } = React.useContext(
    VoterSettingsManagerContext
  );
  const { setIsEnabled: setAudioEnabled } = useAudioControls();
  const { isVisualModeDisabled } = useCurrentTheme();

  const onAudioOnlyPress = React.useCallback(() => {
    if (!isVisualModeDisabled) {
      // If we're about to enable audio-only mode, make sure audio is unmuted:
      setAudioEnabled(true);
    }

    setIsVisualModeDisabled(!isVisualModeDisabled);
    onEnterAudioOnlyMode();
  }, [
    isVisualModeDisabled,
    onEnterAudioOnlyMode,
    setAudioEnabled,
    setIsVisualModeDisabled,
  ]);

  return (
    <SettingsPane id="voterSettingsAudio">
      <Buttons>
        <ToggleAudioButton />
        <Button
          icon={isVisualModeDisabled ? 'Eye' : 'EyeSlash'}
          onPress={onAudioOnlyPress}
        >
          {isVisualModeDisabled
            ? appStrings.buttonExitAudioOnlyMode()
            : appStrings.buttonEnableAudioOnlyMode()}
        </Button>
      </Buttons>
    </SettingsPane>
  );
}

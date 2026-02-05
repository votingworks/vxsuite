import styled from 'styled-components';
import React from 'react';
import { SettingsPane } from './settings_pane';
import { Button } from '../button';
import { VoterSettingsManagerContext } from '../voter_settings_manager_context';
import {
  AppStringKey,
  appStrings,
  ToggleAudioButton,
  WithAltAudio,
} from '../ui_strings';
import { useAudioControls } from '../hooks/use_audio_controls';
import { useCurrentTheme } from '../hooks/use_current_theme';
import { Font } from '../typography';
import { useAudioContext } from '../ui_strings/audio_context';
import { IconName } from '../icons';

const Column = styled.div`
  align-items: start;
  display: flex;
  flex-direction: column;
  gap: ${(p) =>
    // istanbul ignore next
    p.theme.sizeMode === 'touchExtraLarge' ? 0.5 : 0.75}rem;

  @media (orientation: portrait) {
    gap: 1rem;
  }
`;

/** Grid area IDs for the audio volume/rate controls. */
enum CtrlId {
  rateDecrease = 'rateDecrease',
  rateIncrease = 'rateIncrease',
  rateLabel = 'rateLabel',
  volumeDecrease = 'volumeDecrease',
  volumeIncrease = 'volumeIncrease',
  volumeLabel = 'volumeLabel',
}

const Controls = styled.div`
  align-items: center;
  display: grid;
  gap: 0.5rem;
  grid-template-areas:
    '${CtrlId.volumeLabel} ${CtrlId.volumeDecrease} ${CtrlId.volumeIncrease}'
    '${CtrlId.rateLabel}   ${CtrlId.rateDecrease}   ${CtrlId.rateIncrease}';

  @media (orientation: portrait) {
    grid-template-areas:
      '${CtrlId.volumeLabel}    .'
      '${CtrlId.volumeDecrease} ${CtrlId.volumeIncrease}'
      '${CtrlId.rateLabel}      .'
      '${CtrlId.rateDecrease}   ${CtrlId.rateIncrease}';
  }
`;

const Row = styled.div`
  align-items: center;
  display: flex;
  gap: 0.5rem;
`;

export interface AudioSettingsProps {
  onEnterAudioOnlyMode: () => void;
}

export function AudioSettings(props: AudioSettingsProps): JSX.Element {
  const { onEnterAudioOnlyMode } = props;
  const { setIsVisualModeDisabled } = React.useContext(
    VoterSettingsManagerContext
  );

  const {
    setIsEnabled: setAudioEnabled,
    decreaseVolume,
    increaseVolume,
    decreasePlaybackRate,
    increasePlaybackRate,
  } = useAudioControls();

  const isAudioEnabled = useAudioContext()?.isEnabled;
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
      <Column>
        <Row style={{ alignItems: 'end' }}>
          <ToggleAudioButton />
        </Row>
        {isAudioEnabled && (
          <Controls>
            <Font style={{ gridArea: CtrlId.volumeLabel }} weight="bold">
              {appStrings.labelVolume()}
            </Font>
            <AudioControl
              altAudio="buttonDecreaseVolume"
              gridArea={CtrlId.volumeDecrease}
              icon="VolumeDown"
              onPress={decreaseVolume}
            >
              {appStrings.buttonDecrease()}
            </AudioControl>
            <AudioControl
              altAudio="buttonIncreaseVolume"
              gridArea={CtrlId.volumeIncrease}
              icon="VolumeUp"
              onPress={increaseVolume}
            >
              {appStrings.buttonIncrease()}
            </AudioControl>

            <Font style={{ gridArea: CtrlId.rateLabel }} weight="bold">
              {appStrings.labelRateOfSpeech()}
            </Font>
            <AudioControl
              altAudio="buttonDecreaseSpeechRate"
              gridArea={CtrlId.rateDecrease}
              icon="Minus"
              onPress={decreasePlaybackRate}
            >
              {appStrings.buttonDecrease()}
            </AudioControl>
            <AudioControl
              altAudio="buttonIncreaseSpeechRate"
              gridArea={CtrlId.rateIncrease}
              icon="Plus"
              onPress={increasePlaybackRate}
            >
              {appStrings.buttonIncrease()}
            </AudioControl>
          </Controls>
        )}
        <Button
          icon={isVisualModeDisabled ? 'Eye' : 'EyeSlash'}
          onPress={onAudioOnlyPress}
        >
          {isVisualModeDisabled
            ? appStrings.buttonExitAudioOnlyMode()
            : appStrings.buttonEnableAudioOnlyMode()}
        </Button>
      </Column>
    </SettingsPane>
  );
}

function AudioControl(props: {
  altAudio: AppStringKey;
  children: React.ReactNode;
  gridArea: CtrlId;
  icon: IconName;
  onPress: () => void;
}) {
  const { altAudio, children, gridArea, icon, onPress } = props;

  return (
    <Button icon={icon} onPress={onPress} style={{ gridArea }}>
      <WithAltAudio audioText={appStrings[altAudio]()}>{children}</WithAltAudio>
    </Button>
  );
}

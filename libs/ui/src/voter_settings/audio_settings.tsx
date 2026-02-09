import styled from 'styled-components';
import React from 'react';
import { SettingsPane } from './settings_pane';
import { Button } from '../button';
import { VoterSettingsManagerContext } from '../voter_settings_manager_context';
import {
  AppStringKey,
  appStrings,
  rateChangeFeedbackString,
  ToggleAudioButton,
  VOLUME_CHANGE_FEEDBACK_STRING_KEYS,
  WithAltAudio,
} from '../ui_strings';
import { useAudioControls } from '../hooks/use_audio_controls';
import { useCurrentTheme } from '../hooks/use_current_theme';
import { Font } from '../typography';
import { useAudioContext } from '../ui_strings/audio_context';
import { AssistiveTechInstructions } from '../accessible_controllers';
import { IconName } from '../icons';
import { AudioVolume } from '../ui_strings/audio_volume';

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
      <Column>
        <ToggleAudioButton />
        <AudioControls />
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

function AudioControls() {
  const ctx = useAudioContext();
  const {
    decreaseVolume,
    increaseVolume,
    decreasePlaybackRate,
    increasePlaybackRate,
  } = useAudioControls();

  if (!ctx?.isEnabled) return null;

  return (
    <Controls>
      <Font style={{ gridArea: CtrlId.volumeLabel }} weight="bold">
        {appStrings.labelVolume()}
      </Font>
      <AudioControl
        gridArea={CtrlId.volumeDecrease}
        icon="VolumeDown"
        instructionsController="instructionsVolumeDownButton"
        instructionsPat="instructionsVolumeDownButtonPat"
        onPress={decreaseVolume}
        statusString={volumeString(ctx.volume)}
      >
        {appStrings.buttonDecrease()}
      </AudioControl>
      <AudioControl
        gridArea={CtrlId.volumeIncrease}
        icon="VolumeUp"
        instructionsController="instructionsVolumeUpButton"
        instructionsPat="instructionsVolumeUpButtonPat"
        onPress={increaseVolume}
        statusString={volumeString(ctx.volume)}
      >
        {appStrings.buttonIncrease()}
      </AudioControl>

      <Font style={{ gridArea: CtrlId.rateLabel }} weight="bold">
        {appStrings.labelRateOfSpeech()}
      </Font>
      <AudioControl
        gridArea={CtrlId.rateDecrease}
        icon="Minus"
        instructionsController="instructionsSpeechRateDownButton"
        instructionsPat="instructionsSpeechRateDownButtonPat"
        onPress={decreasePlaybackRate}
        statusString={rateChangeFeedbackString(ctx.playbackRate)}
      >
        {appStrings.buttonDecrease()}
      </AudioControl>
      <AudioControl
        gridArea={CtrlId.rateIncrease}
        icon="Plus"
        instructionsController="instructionsSpeechRateUpButton"
        instructionsPat="instructionsSpeechRateUpButtonPat"
        onPress={increasePlaybackRate}
        statusString={rateChangeFeedbackString(ctx.playbackRate)}
      >
        {appStrings.buttonIncrease()}
      </AudioControl>
    </Controls>
  );
}

function AudioControl(props: {
  children: React.ReactNode;
  gridArea: CtrlId;
  icon: IconName;
  instructionsController: AppStringKey;
  instructionsPat: AppStringKey;
  onPress: () => void;
  statusString: React.ReactNode;
}) {
  const {
    children,
    gridArea,
    icon,
    instructionsController,
    instructionsPat,
    onPress,
    statusString,
  } = props;

  const audioText = (
    <React.Fragment>
      {statusString}

      <AssistiveTechInstructions
        controllerString={appStrings[instructionsController]()}
        patDeviceString={appStrings[instructionsPat]()}
      />
    </React.Fragment>
  );

  return (
    <Button icon={icon} onPress={onPress} style={{ gridArea }}>
      <WithAltAudio audioText={audioText}>{children}</WithAltAudio>
    </Button>
  );
}

function volumeString(volume: AudioVolume) {
  const key = VOLUME_CHANGE_FEEDBACK_STRING_KEYS[volume];
  return appStrings[key]();
}

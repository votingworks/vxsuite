import React from 'react';
import styled from 'styled-components';

import { SettingsPaneId } from './types.js';
import { TabBar } from './tab_bar.js';
import { ColorSettings, ColorSettingsProps } from './color_settings.js';
import { SizeSettings, SizeSettingsProps } from './size_settings.js';
import { H2 } from '../typography.js';
import { Button } from '../button.js';
import { VoterSettingsManagerContext } from '../voter_settings_manager_context.js';
import { useScreenInfo } from '../hooks/use_screen_info.js';
import { appStrings } from '../ui_strings/index.js';
import { Header } from './header.js';
import { AudioSettings } from './audio_settings.js';
import { useAudioControls } from '../hooks/use_audio_controls.js';

export interface VoterSettingsProps {
  /** @default ['contrastLow', 'contrastMedium', 'contrastHighLight', 'contrastHighDark'] */
  colorModes?: ColorSettingsProps['colorModes'];
  onClose: () => void;
  /** @default ['touchSmall', 'touchMedium', 'touchLarge', 'touchExtraLarge'] */
  sizeModes?: SizeSettingsProps['sizeModes'];
  allowAudioVideoOnlyToggles?: boolean;
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
`;

const ActivePaneContainer = styled.div`
  flex-grow: 1;
`;

const Footer = styled.div`
  display: flex;
  gap: 0.5rem;
  justify-content: end;
  padding: max(0.25rem, ${(p) => p.theme.sizes.minTouchAreaSeparationPx}px)
    0.5rem;
`;

/**
 * Display setting controls for VxSuite apps.
 *
 * These settings modify the active UI theme used by components in libs/ui, as
 * well as theme-dependent global styles.
 */
export function VoterSettings(props: VoterSettingsProps): JSX.Element {
  const { colorModes, allowAudioVideoOnlyToggles, onClose, sizeModes } = props;

  const screenInfo = useScreenInfo();

  const [activePaneId, setActivePaneId] =
    React.useState<SettingsPaneId>('voterSettingsColor');

  const { resetThemes } = React.useContext(VoterSettingsManagerContext);
  const { reset: resetAudioSettings } = useAudioControls();

  const resetVoterSettings = React.useCallback(() => {
    resetThemes();
    resetAudioSettings();
  }, [resetAudioSettings, resetThemes]);

  return (
    <Container>
      <Header portrait={screenInfo.isPortrait}>
        <H2 as="h1">{appStrings.titleVoterSettings()}</H2>
        <TabBar
          activePaneId={activePaneId}
          grow={!screenInfo.isPortrait}
          onChange={setActivePaneId}
          allowAudioVideoOnlyToggles={allowAudioVideoOnlyToggles}
        />
      </Header>
      <ActivePaneContainer>
        {activePaneId === 'voterSettingsColor' && (
          <ColorSettings colorModes={colorModes} />
        )}
        {activePaneId === 'voterSettingsSize' && (
          <SizeSettings sizeModes={sizeModes} />
        )}
        {activePaneId === 'voterSettingsAudio' && (
          <AudioSettings onEnterAudioOnlyMode={onClose} />
        )}
      </ActivePaneContainer>
      <Footer>
        <Button onPress={resetVoterSettings}>{appStrings.buttonReset()}</Button>
        <Button onPress={onClose} variant="primary" icon="Done">
          {appStrings.buttonDone()}
        </Button>
      </Footer>
    </Container>
  );
}

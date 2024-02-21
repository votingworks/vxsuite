import React from 'react';
import styled from 'styled-components';

import { SettingsPaneId } from './types';
import { TabBar } from './tab_bar';
import { ColorSettings, ColorSettingsProps } from './color_settings';
import { SizeSettings, SizeSettingsProps } from './size_settings';
import { H2 } from '../typography';
import { Button } from '../button';
import { DisplaySettingsManagerContext } from '../display_settings_manager_context';
import { useScreenInfo } from '../hooks/use_screen_info';
import { appStrings } from '../ui_strings';
import { Header } from './header';
import { AudioVideoOnlySettings } from './audio_video_only_settings';

export interface DisplaySettingsProps {
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
export function DisplaySettings(props: DisplaySettingsProps): JSX.Element {
  const { colorModes, allowAudioVideoOnlyToggles, onClose, sizeModes } = props;

  const screenInfo = useScreenInfo();

  const [activePaneId, setActivePaneId] = React.useState<SettingsPaneId>(
    'displaySettingsColor'
  );

  const { resetThemes } = React.useContext(DisplaySettingsManagerContext);

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
        {activePaneId === 'displaySettingsColor' && (
          <ColorSettings colorModes={colorModes} />
        )}
        {activePaneId === 'displaySettingsSize' && (
          <SizeSettings sizeModes={sizeModes} />
        )}
        {activePaneId === 'displaySettingsAudioVideoOnly' && (
          <AudioVideoOnlySettings />
        )}
      </ActivePaneContainer>
      <Footer>
        <Button onPress={resetThemes}>{appStrings.buttonReset()}</Button>
        <Button onPress={onClose} variant="primary" icon="Done">
          {appStrings.buttonDone()}
        </Button>
      </Footer>
    </Container>
  );
}

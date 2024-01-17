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

export interface DisplaySettingsProps {
  /** @default ['contrastLow', 'contrastMedium', 'contrastHighLight', 'contrastHighDark'] */
  colorModes?: ColorSettingsProps['colorModes'];
  onClose: () => void;
  /** @default ['touchSmall', 'touchMedium', 'touchLarge', 'touchExtraLarge'] */
  sizeModes?: SizeSettingsProps['sizeModes'];
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
`;

interface HeaderProps {
  portrait?: boolean;
}

/* istanbul ignore next */
const Header = styled.div<HeaderProps>`
  align-items: ${(p) => (p.portrait ? 'stretch' : 'center')};
  border-bottom: ${(p) => p.theme.sizes.bordersRem.hairline}rem dotted
    ${(p) => p.theme.colors.outline};
  display: flex;
  flex-direction: ${(p) => (p.portrait ? 'column' : 'row')};
  gap: ${(p) => (p.portrait ? 0.25 : 0.5)}rem;
  padding: 0.25rem 0.5rem 0.5rem;
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
  const { colorModes, onClose, sizeModes } = props;

  const screenInfo = useScreenInfo();

  const [activePaneId, setActivePaneId] = React.useState<SettingsPaneId>(
    'displaySettingsColor'
  );

  const { resetThemes } = React.useContext(DisplaySettingsManagerContext);

  return (
    <Container>
      <Header portrait={screenInfo.isPortrait}>
        <H2 as="h1">{appStrings.titleDisplaySettings()}</H2>
        <TabBar
          activePaneId={activePaneId}
          grow={!screenInfo.isPortrait}
          onChange={setActivePaneId}
        />
      </Header>
      <ActivePaneContainer>
        {activePaneId === 'displaySettingsColor' && (
          <ColorSettings colorModes={colorModes} />
        )}
        {activePaneId === 'displaySettingsSize' && (
          <SizeSettings sizeModes={sizeModes} />
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

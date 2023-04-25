/* stylelint-disable order/properties-order */
import React from 'react';
import styled from 'styled-components';

import { SettingsPaneId } from './types';
import { TabBar } from './tab_bar';
import { ColorSettings, ColorSettingsProps } from './color_settings';
import { SizeSettings, SizeSettingsProps } from './size_settings';
import { H1 } from '../typography';
import { Button } from '../button';
import { ThemeManagerContext } from '../theme_manager_context';

export interface DisplaySettingsProps {
  /** @default ['contrastLow', 'contrastMedium', 'contrastHighLight', 'contrastHighDark'] */
  colorModes?: ColorSettingsProps['colorModes'];
  onClose: () => void;
  /** @default ['s', 'm', 'l', 'xl'] */
  sizeModes?: SizeSettingsProps['sizeModes'];
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
`;

const Header = styled.div`
  padding: 0.5rem 0.5rem 0.125rem;
`;

const ActivePaneContainer = styled.div`
  flex-grow: 1;
`;

const Footer = styled.div`
  display: flex;
  gap: 0.5rem;
  justify-content: end;
  padding: 0.25rem 0.5rem 0.5rem;
`;

/**
 * Display setting controls for VxSuite apps.
 *
 * These settings modify the active UI theme used by components in libs/ui, as
 * well as theme-dependent global styles.
 */
export function DisplaySettings(props: DisplaySettingsProps): JSX.Element {
  const { colorModes, onClose, sizeModes } = props;

  const [activePaneId, setActivePaneId] = React.useState<SettingsPaneId>(
    'displaySettingsColor'
  );

  const { resetThemes } = React.useContext(ThemeManagerContext);

  return (
    <Container>
      <Header>
        <H1>Display Settings</H1>
      </Header>
      <TabBar activePaneId={activePaneId} onChange={setActivePaneId} />
      <ActivePaneContainer>
        {activePaneId === 'displaySettingsColor' && (
          <ColorSettings colorModes={colorModes} />
        )}
        {activePaneId === 'displaySettingsSize' && (
          <SizeSettings sizeModes={sizeModes} />
        )}
      </ActivePaneContainer>
      <Footer>
        <Button onPress={resetThemes}>Reset</Button>
        <Button onPress={onClose} variant="done">
          Done
        </Button>
      </Footer>
    </Container>
  );
}

/* istanbul ignore file - presentational component */

import React from 'react';
import styled, { DefaultTheme } from 'styled-components';

import {
  LanguageSettingsButton,
  LanguageSettingsScreen,
  Main,
  Screen,
  VoterSettings,
  useScreenInfo,
} from '@votingworks/ui';
import { SizeMode } from '@votingworks/types';

import { VoterSettingsButton } from './voter_settings_button';

export interface VoterScreenProps {
  actionButtons?: React.ReactNode;
  breadcrumbs?: React.ReactNode;
  children: React.ReactNode;
  centerContent?: boolean;
  padded?: boolean;
  hideMenuButtons?: boolean;
}

export const MARK_FLOW_UI_VOTER_SCREEN_TEST_ID = 'markFlowUiVoterScreen';

const COMPACT_SIZE_MODES = new Set<SizeMode>(['touchLarge', 'touchExtraLarge']);

function isCompactMode(p: { theme: DefaultTheme }) {
  return COMPACT_SIZE_MODES.has(p.theme.sizeMode);
}

function getButtonBarSpacingRem(p: { theme: DefaultTheme }) {
  return isCompactMode(p) ? 0.3 : 0.5;
}

const ButtonBar = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${(p) => getButtonBarSpacingRem(p)}rem;
  padding: ${(p) => getButtonBarSpacingRem(p)}rem;
`;

const Header = styled(ButtonBar)`
  border-bottom: ${(p) => p.theme.sizes.bordersRem.thick}rem solid
    ${(p) => p.theme.colors.outline};
  order: 1;
`;

const Body = styled(Main)`
  order: 2;
`;

const Footer = styled(ButtonBar)`
  border-top: ${(p) => p.theme.sizes.bordersRem.thick}rem solid
    ${(p) => p.theme.colors.outline};
  order: 3;
`;

const SideBar = styled(ButtonBar)`
  border-left: ${(p) => p.theme.sizes.bordersRem.thick}rem solid
    ${(p) => p.theme.colors.outline};
  justify-content: center;
  max-width: 35%;
  order: 3;
`;

const ButtonGrid = styled.div`
  align-items: center;
  display: grid;
  grid-gap: ${(p) => getButtonBarSpacingRem(p)}rem;

  & > * {
    height: 100%;
    width: 100%;
  }
`;

const PortraitButtonGrid = styled(ButtonGrid)`
  grid-template-columns: 1fr 1fr;

  /*
   * For single-button grids, expand the button to fill out the whole row.
   * Particularly useful for avoiding unnecessary button text wrapping at larger
   * display size settings.
   */
  & > *:first-child:last-child {
    grid-column: 1 / span 2;
  }
`;

const LandscapeButtonGrid = styled(ButtonGrid)`
  grid-template-columns: 1fr;
`;

const BreadcrumbsContainer = styled.div`
  display: flex;
  justify-content: center;
`;

/**
 * Base screen layout for voter-facing screens, rendered with persistent voter
 * settings menu buttons, along with optional context-specific action buttons.
 */
export function VoterScreen(props: VoterScreenProps): JSX.Element {
  const {
    actionButtons,
    breadcrumbs,
    centerContent,
    children,
    padded,
    hideMenuButtons,
  } = props;

  const [showLanguageSettings, setShowLanguageSettings] = React.useState(false);
  const [showVoterSettings, setShowVoterSettings] = React.useState(false);

  const screenInfo = useScreenInfo();

  if (showLanguageSettings) {
    return (
      <LanguageSettingsScreen onDone={() => setShowLanguageSettings(false)} />
    );
  }

  if (showVoterSettings) {
    return (
      <VoterSettings
        allowAudioVideoOnlyToggles
        onClose={() => setShowVoterSettings(false)}
      />
    );
  }

  const optionalBreadcrumbs = breadcrumbs && (
    <BreadcrumbsContainer>{breadcrumbs}</BreadcrumbsContainer>
  );

  const menuButtons = (
    <React.Fragment>
      <LanguageSettingsButton onPress={() => setShowLanguageSettings(true)} />
      <VoterSettingsButton onPress={() => setShowVoterSettings(true)} />
    </React.Fragment>
  );

  if (screenInfo.isPortrait) {
    return (
      // NOTE: Elements are rendered in accessible focus order and visually
      // re-ordered using flex ordering (see styles above).
      <Screen flexDirection="column">
        <Body centerChild={centerContent} flexColumn padded={padded}>
          {children}
        </Body>
        {actionButtons && (
          <Footer>
            {optionalBreadcrumbs}
            <PortraitButtonGrid>{actionButtons}</PortraitButtonGrid>
          </Footer>
        )}
        {!hideMenuButtons && (
          <Header>
            <PortraitButtonGrid>{menuButtons}</PortraitButtonGrid>
          </Header>
        )}
      </Screen>
    );
  }

  return (
    <Screen flexDirection="row" data-testid={MARK_FLOW_UI_VOTER_SCREEN_TEST_ID}>
      <Body centerChild={centerContent} flexColumn padded={padded}>
        {children}
      </Body>
      <SideBar>
        <LandscapeButtonGrid>
          {menuButtons}
          {actionButtons}
        </LandscapeButtonGrid>
        {optionalBreadcrumbs}
      </SideBar>
    </Screen>
  );
}

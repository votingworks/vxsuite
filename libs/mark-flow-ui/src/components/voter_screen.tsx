/* istanbul ignore file - @preserve - presentational component */

import React from 'react';
import styled, { DefaultTheme } from 'styled-components';

import {
  LanguageSettingsButton,
  LanguageSettingsScreen,
  Main,
  Screen,
  VoterHelpButton,
  VoterSettings,
  useScreenInfo,
} from '@votingworks/ui';
import { SizeMode } from '@votingworks/types';

import { assert } from '@votingworks/basics';
import { VoterSettingsButton } from './voter_settings_button';

export interface VoterHelpScreenProps {
  onClose: () => void;
}
export type VoterHelpScreenType = React.ComponentType<VoterHelpScreenProps>;

export interface VoterScreenProps {
  actionButtons?: React.ReactNode;
  breadcrumbs?: React.ReactNode;
  children: React.ReactNode;
  centerContent?: boolean;
  padded?: boolean;
  hideMenuButtons?: boolean;
  VoterHelpScreen?: VoterHelpScreenType;
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
  /* One button */
  grid-template-columns: 1fr;

  /* Two buttons */
  &:has(> :first-child:nth-last-child(2)) {
    grid-template-columns: 1fr 1fr;
  }

  /* Three buttons */
  &:has(> :first-child:nth-last-child(3)) {
    grid-template-columns: 1fr 1fr 1fr;
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
    VoterHelpScreen,
  } = props;

  const [showLanguageSettings, setShowLanguageSettings] = React.useState(false);
  const [showVoterSettings, setShowVoterSettings] = React.useState(false);
  const [showVoterHelpScreen, setShowVoterHelpScreen] = React.useState(false);

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

  if (showVoterHelpScreen) {
    assert(VoterHelpScreen !== undefined);
    return <VoterHelpScreen onClose={() => setShowVoterHelpScreen(false)} />;
  }

  const optionalBreadcrumbs = breadcrumbs && (
    <BreadcrumbsContainer>{breadcrumbs}</BreadcrumbsContainer>
  );

  const menuButtons = (
    <React.Fragment>
      <LanguageSettingsButton onPress={() => setShowLanguageSettings(true)} />
      <VoterSettingsButton onPress={() => setShowVoterSettings(true)} />
      {VoterHelpScreen && (
        <VoterHelpButton onPress={() => setShowVoterHelpScreen(true)} />
      )}
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

import React from 'react';
import {
  Screen as ScreenBase,
  Main,
  ElectionInfoBar,
  InfoBarMode,
  H1,
  LanguageSettingsButton,
  LanguageSettingsScreen,
  ReadOnLoad,
  AudioOnly,
  TestModeCallout,
} from '@votingworks/ui';
import styled, { DefaultTheme, ThemeContext } from 'styled-components';
import { SizeMode } from '@votingworks/types';
import { getConfig, getMachineConfig, getScannerStatus } from '../api';
import { ScannedBallotCount } from './scanned_ballot_count';
import { VoterSettingsButton } from './voter_settings_button';

/**
 * At larger text sizes, the election info bar takes up too much valuable screen
 * space, so we're hiding it in cases where a voter increases text size.
 */
const ELECTION_BAR_HIDDEN_SIZE_MODES: ReadonlySet<SizeMode> = new Set([
  'touchLarge',
  'touchExtraLarge',
]);

export interface ScreenProps {
  actionButtons?: React.ReactNode;
  ballotCountOverride?: number;
  hideBallotCount?: boolean;
  centerContent?: boolean;
  children: React.ReactNode;
  infoBarMode?: InfoBarMode;
  hideInfoBar?: boolean;
  padded?: boolean;
  title?: React.ReactNode;
  showTestModeBanner: boolean;
  voterFacing: boolean;
}

export type CenteredScreenProps = Omit<ScreenProps, 'centered' | 'padded'>;

const CONTENT_SPACING_VALUES_REM: Readonly<Record<SizeMode, number>> = {
  desktop: 0.5, // unused
  print: 0.5, // unused
  touchSmall: 0.5,
  touchMedium: 0.35,
  touchLarge: 0.25,
  touchExtraLarge: 0.2,
};

function getSpacingValueRem(p: { theme: DefaultTheme }) {
  return CONTENT_SPACING_VALUES_REM[p.theme.sizeMode];
}

const ButtonBar = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-gap: ${(p) => getSpacingValueRem(p)}rem;
  padding: ${(p) => getSpacingValueRem(p)}rem;

  & > * {
    height: 100%;
    width: 100%;
  }

  & > :only-child {
    grid-column: 1 / span 2;
  }
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: start;
  gap: ${(p) => getSpacingValueRem(p)}rem;
  padding: ${(p) => getSpacingValueRem(p)}rem;
  justify-content: space-between;
`;

const SettingsButtons = styled.div`
  display: flex;
  gap: ${(p) => getSpacingValueRem(p)}rem;
`;

const TitleContainer = styled.div`
  min-width: 5rem;
`;

export function Screen(props: ScreenProps): JSX.Element | null {
  const {
    actionButtons,
    children,
    hideBallotCount: hideBallotCountFromProps,
    ballotCountOverride,
    centerContent,
    infoBarMode,
    hideInfoBar: hideInfoBarFromProps,
    showTestModeBanner,
    padded,
    title,
    voterFacing,
  } = props;

  const [shouldShowLanguageSettings, setShouldShowLanguageSettings] =
    React.useState(false);

  const machineConfigQuery = getMachineConfig.useQuery();
  const configQuery = getConfig.useQuery();
  const scannerStatusQuery = getScannerStatus.useQuery();

  const currentTheme = React.useContext(ThemeContext);

  if (shouldShowLanguageSettings) {
    return (
      <LanguageSettingsScreen
        onDone={() => setShouldShowLanguageSettings(false)}
      />
    );
  }

  if (!(machineConfigQuery.isSuccess && configQuery.isSuccess)) {
    return null;
  }

  const { codeVersion, machineId } = machineConfigQuery.data;
  const { electionDefinition, electionPackageHash, precinctSelection } =
    configQuery.data;

  const ballotCount =
    ballotCountOverride ?? scannerStatusQuery.data?.ballotsCounted;

  const hideInfoBar =
    hideInfoBarFromProps ||
    (infoBarMode !== 'admin' &&
      (!electionDefinition ||
        ELECTION_BAR_HIDDEN_SIZE_MODES.has(currentTheme.sizeMode)));

  const ballotCountElement = !hideBallotCountFromProps &&
    ballotCount !== undefined && <ScannedBallotCount count={ballotCount} />;

  return (
    <ScreenBase>
      {voterFacing && (
        <HeaderRow>
          <SettingsButtons>
            <LanguageSettingsButton
              onPress={() => setShouldShowLanguageSettings(true)}
            />
            <VoterSettingsButton />
          </SettingsButtons>
          {showTestModeBanner && <TestModeCallout />}
          {ballotCountElement}
        </HeaderRow>
      )}
      <HeaderRow>
        <TitleContainer>{title && <H1>{title}</H1>}</TitleContainer>
        {!voterFacing && showTestModeBanner && <TestModeCallout />}
        {!voterFacing && ballotCountElement}
      </HeaderRow>
      {voterFacing ? (
        <ReadOnLoad as={Main} centerChild={centerContent} padded={padded}>
          {title && <AudioOnly>{title}</AudioOnly>}
          {children}
        </ReadOnLoad>
      ) : (
        <Main centerChild={centerContent} padded={padded}>
          {children}
        </Main>
      )}
      {actionButtons && <ButtonBar>{actionButtons}</ButtonBar>}
      {!hideInfoBar && (
        <ElectionInfoBar
          mode={infoBarMode}
          precinctSelection={precinctSelection}
          electionDefinition={electionDefinition}
          electionPackageHash={electionPackageHash}
          codeVersion={codeVersion}
          machineId={machineId}
        />
      )}
    </ScreenBase>
  );
}

export function ScreenMainCenterChild(
  props: CenteredScreenProps
): JSX.Element | null {
  return <Screen {...props} centerContent padded />;
}

export const CenteredText = styled.div`
  margin: 0 auto;
  text-align: center;
`;

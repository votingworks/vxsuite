import { ThemeProvider } from 'styled-components';
import { makeTheme, TouchscreenPalette } from './themes/make_theme';
import { Icons } from './icons';
import { TextOnly } from './ui_strings';
import {
  MachineModeCardDesktop,
  MachineModeCardTouch,
} from './machine_mode_card';

const EARLY_VOTING_PURPLE = TouchscreenPalette.Purple80;

function EarlyVotingCalloutTouch({
  style,
}: {
  style?: React.CSSProperties;
}): JSX.Element {
  return (
    <TextOnly>
      <ThemeProvider
        theme={(theme) =>
          // Lock to "medium" size mode to keep things from getting out of hand at
          // larger text sizes.
          makeTheme({
            ...theme,
            sizeMode: 'touchMedium',
          })
        }
      >
        <MachineModeCardTouch style={style} borderColor={EARLY_VOTING_PURPLE}>
          <Icons.Clock
            style={{
              color: EARLY_VOTING_PURPLE,
            }}
          />{' '}
          Early Voting
        </MachineModeCardTouch>
      </ThemeProvider>
    </TextOnly>
  );
}

function EarlyVotingCalloutDesktop({
  style,
}: {
  style?: React.CSSProperties;
}): JSX.Element {
  return (
    <MachineModeCardDesktop style={style} color="primary">
      <Icons.Clock color="primary" /> Early Voting
    </MachineModeCardDesktop>
  );
}

export function EarlyVotingCallout({
  viewMode,
  style,
}: {
  viewMode: 'touch' | 'desktop';
  style?: React.CSSProperties;
}): JSX.Element {
  if (viewMode === 'desktop') {
    return <EarlyVotingCalloutDesktop style={style} />;
  }

  return <EarlyVotingCalloutTouch style={style} />;
}

import { ThemeProvider } from 'styled-components';
import { makeTheme, TouchscreenPalette } from './themes/make_theme.js';
import { Icons } from './icons.js';
import { TextOnly } from './ui_strings/index.js';
import {
  MachineModeCardDesktop,
  MachineModeCardTouch,
} from './machine_mode_card.js';

function TestModeCalloutTouch({
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
        <MachineModeCardTouch
          style={style}
          borderColor={TouchscreenPalette.Orange50}
        >
          <Icons.Warning
            style={{
              // We always want a bright orange, even if the color mode is
              // different, so we harcode instead of using the theme.
              color: TouchscreenPalette.Orange50,
            }}
          />{' '}
          Test Ballot Mode
        </MachineModeCardTouch>
      </ThemeProvider>
    </TextOnly>
  );
}

function TestModeCalloutDesktop({
  style,
}: {
  style?: React.CSSProperties;
}): JSX.Element {
  return (
    <MachineModeCardDesktop style={style} color="warning">
      <Icons.Warning color="warning" /> Test Ballot Mode
    </MachineModeCardDesktop>
  );
}

export function TestModeCallout({
  viewMode,
  style,
}: {
  viewMode: 'touch' | 'desktop';
  style?: React.CSSProperties;
}): JSX.Element {
  if (viewMode === 'desktop') {
    return <TestModeCalloutDesktop style={style} />;
  }

  return <TestModeCalloutTouch style={style} />;
}

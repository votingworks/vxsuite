import styled, { ThemeProvider } from 'styled-components';
import { makeTheme, TouchscreenPalette } from './themes/make_theme';
import { Icons } from './icons';
import { TextOnly } from './ui_strings';

const EarlyVotingModeCard = styled.div`
  font-size: ${(p) => p.theme.sizes.fontDefault}px;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  padding: 0.125em 0.5em;
  border: ${(p) => p.theme.sizes.bordersRem.thin}em solid
    ${TouchscreenPalette.Purple80};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}em;
  color: ${(p) => p.theme.colors.onBackground};
  background-color: ${(p) => p.theme.colors.background};
`;

export function EarlyVotingModeCallout({
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
        <EarlyVotingModeCard style={style}>
          <Icons.Info
            style={{
              // We always want a bright purple, even if the color mode is
              // different, so we hardcode instead of using the theme.
              color: TouchscreenPalette.Purple80,
            }}
          />{' '}
          Early Voting Mode
        </EarlyVotingModeCard>
      </ThemeProvider>
    </TextOnly>
  );
}

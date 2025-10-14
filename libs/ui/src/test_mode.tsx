import styled, { DefaultTheme, ThemeProvider } from 'styled-components';
import { makeTheme, TouchscreenPalette } from './themes/make_theme';
import { Icons } from './icons';
import { TextOnly } from './ui_strings';

const TestModeCard = styled.div`
  font-size: ${(p) => p.theme.sizes.fontDefault}px;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  padding: 0.125em 0.5em;
  border: ${(p) => p.theme.sizes.bordersRem.thin}em solid
    ${TouchscreenPalette.Orange50};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}em;
  color: ${(p) => p.theme.colors.onBackground};
  background-color: ${(p) => p.theme.colors.background};
`;

export function TestModeCallout({
  style,
  themeOverride,
}: {
  style?: React.CSSProperties;
  themeOverride?: DefaultTheme;
}): JSX.Element {
  return (
    <TextOnly>
      <ThemeProvider
        theme={(theme) =>
          // Lock to "medium" size mode to keep things from getting out of hand at
          // larger text sizes.
          makeTheme(
            themeOverride || {
              ...theme,
              sizeMode: 'touchMedium',
            }
          )
        }
      >
        <TestModeCard style={style}>
          <Icons.Warning
            style={{
              // We always want a bright orange, even if the color mode is
              // different, so we harcode instead of using the theme.
              color: TouchscreenPalette.Orange50,
            }}
          />{' '}
          Test Ballot Mode
        </TestModeCard>
      </ThemeProvider>
    </TextOnly>
  );
}

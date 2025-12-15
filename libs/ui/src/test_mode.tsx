import styled, { ThemeProvider } from 'styled-components';
import { makeTheme, TouchscreenPalette } from './themes/make_theme';
import { Icons } from './icons';
import { TextOnly } from './ui_strings';
import { Card } from './card';

const TestModeCardTouch = styled.div`
  font-size: ${(p) => p.theme.sizes.fontDefault}px;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  padding: 0.125em 0.5em;
  border: ${(p) => p.theme.sizes.bordersRem.thin}em solid
    ${TouchscreenPalette.Orange50};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}em;
  color: ${(p) => p.theme.colors.onBackground};
  background-color: ${(p) => p.theme.colors.background};
`;

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
        <TestModeCardTouch style={style}>
          <Icons.Warning
            style={{
              // We always want a bright orange, even if the color mode is
              // different, so we harcode instead of using the theme.
              color: TouchscreenPalette.Orange50,
            }}
          />{' '}
          Test Ballot Mode
        </TestModeCardTouch>
      </ThemeProvider>
    </TextOnly>
  );
}

const TestModeCardDesktop = styled(Card)`
  font-size: ${(p) => p.theme.sizes.headingsRem.h3}rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};

  > div {
    padding: 0.5rem 1rem;
  }

  flex-shrink: 0;
`;

function TestModeCalloutDesktop({
  style,
}: {
  style?: React.CSSProperties;
}): JSX.Element {
  return (
    <TestModeCardDesktop style={style} color="warning">
      <Icons.Warning color="warning" /> Test Ballot Mode
    </TestModeCardDesktop>
  );
}

export function TestModeCallout({
  forDesktop,
  style,
}: {
  forDesktop?: boolean;
  style?: React.CSSProperties;
}): JSX.Element {
  if (forDesktop) {
    return <TestModeCalloutDesktop style={style} />;
  }

  return <TestModeCalloutTouch style={style} />;
}

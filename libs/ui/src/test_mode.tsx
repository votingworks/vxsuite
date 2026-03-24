import styled, { ThemeProvider } from 'styled-components';
import { isTouchSizeMode } from '@votingworks/types';
import {
  DesktopPalette,
  makeTheme,
  TouchscreenPalette,
} from './themes/make_theme';
import { Icons } from './icons';
import { TextOnly } from './ui_strings';
import { H3 } from './typography';

const BannerStrip = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5em;
  width: 100%;
  padding: 0.5em 0;
  color: ${(p) => p.theme.colors.onBackground};
  background-color: ${(p) =>
    // We use specific non-theme colors to make this banner stand out.
    isTouchSizeMode(p.theme.sizeMode)
      ? TouchscreenPalette.Orange30
      : DesktopPalette.Orange30};
  border-bottom: ${(p) => p.theme.sizes.bordersRem.thin}em solid
    ${(p) =>
      isTouchSizeMode(p.theme.sizeMode)
        ? p.theme.colors.outline
        : p.theme.colors.warningAccent};
  font-size: ${(p) =>
    // Lock the font size to the local theme (rather than using the root font size)
    // This will control font size as well as spacing, border width, etc.
    p.theme.sizes.fontDefault}px;

  h3 {
    margin: 0;
    font-size: ${(p) => p.theme.sizes.headingsRem.h3}em;
  }
`;

export function TestModeBanner(): JSX.Element {
  return (
    <ThemeProvider
      theme={(t) =>
        makeTheme({
          ...t,
          // If we're in a touch theme context, lock the banner to medium
          // size/contrast
          ...(isTouchSizeMode(t.sizeMode)
            ? {
                sizeMode: 'touchMedium',
                colorMode: 'contrastMedium',
              }
            : {}),
        })
      }
    >
      <TextOnly>
        <BannerStrip>
          <H3>
            <Icons.Warning /> Test Ballot Mode
          </H3>
        </BannerStrip>
      </TextOnly>
    </ThemeProvider>
  );
}

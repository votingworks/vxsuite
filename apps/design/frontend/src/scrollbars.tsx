import { DesktopPalette } from '@votingworks/ui';
import { DefaultTheme, css } from 'styled-components';

function colorBg(p: { theme: DefaultTheme }) {
  return p.theme.colors.background;
}

const colorThumb = DesktopPalette.Purple40;
const thicknessRem = 0.45;

export const cssStyledScrollbars = css`
  scrollbar-track-color: ${colorBg};
  scrollbar-color: ${colorThumb};
  scrollbar-width: ${thicknessRem}rem;
  scroll-behavior: smooth;

  ::-webkit-scrollbar {
    height: ${thicknessRem}rem;
    width: ${thicknessRem}rem;
  }

  ::-webkit-scrollbar-track {
    background: ${colorBg};
    border-radius: 100vw;
  }

  ::-webkit-scrollbar-thumb {
    background: ${colorThumb};
    border-radius: 100vw;

    :hover {
      background: ${DesktopPalette.Purple60};
    }
  }
`;

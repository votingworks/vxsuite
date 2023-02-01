import 'normalize.css';
import { createGlobalStyle } from 'styled-components';

export interface GlobalStylesProps {
  enableScroll: boolean;
  isTouchscreen: boolean;
  legacyBaseFontSizePx?: number;
  legacyPrintFontSizePx?: number;
}

/**
 * Common global styling for VxSuite apps.
 *
 * TODO: Copied from old App.css files in the frontend packages - could probably
 * use some cleanup and de-duping with the normalize.css styles we're already
 * importing.
 *
 * TODO: Hardcode base64-encoded versions of our font files and reference here,
 * so that everything's centralized and we don't have to have duplicate
 * copies in each app's package.
 */
export const GlobalStyles = createGlobalStyle<GlobalStylesProps>`
  *,
  *::before,
  *::after {
    box-sizing: inherit;
  }

  html {
    box-sizing: border-box;
    background: ${(p) => p.theme.colors.background};
    line-height: 1;
    letter-spacing: ${(p) => p.theme.sizes.letterSpacingEm}em;
    color: ${(p) => p.theme.colors.foreground};
    font-family: 'Vx Helvetica Neue', 'Noto Emoji', 'Helvetica Neue', sans-serif;
    font-size: ${(p) => p.legacyBaseFontSizePx || p.theme.sizes.fontDefault}px;
    font-weight: ${(p) => p.theme.sizes.fontWeight.regular};

    -moz-osx-font-smoothing: grayscale;
    -webkit-font-smoothing: antialiased;

    user-select: none;
  }
  @media print {
    html {
      background: #ffffff;

      /* Adjust printed ballot font-size */
      /* stylelint-disable-next-line declaration-no-important */
      font-size: ${(p) => p.legacyPrintFontSizePx ?? 16}px !important;
    }
  }

  body {
    margin: 0;
  }

  html,
  body,
  #root {
    height: 100%;
    overflow: ${(p) => (p.enableScroll ? 'auto' : 'hidden')};
    touch-action: none;
  }
  @media print {
    html,
    body {
      height: auto;
      overflow: visible;
    }
    #root {
      display: none; /* Do not print anything displayed in the app */
    }
  }

  b {
    font-weight: ${(p) => p.theme.sizes.fontWeight.bold};
  }

  table {
    border-collapse: collapse;
  }

  fieldset {
    margin: 0;
    border: none;
    padding: 0;
  }

  legend {
    display: block;
  }

  img {
    display: block;
  }

  select option {
    background-color: ${(p) => p.theme.colors.background};
    color: ${(p) => p.theme.colors.foreground};

    &:disabled {
      color: ${(p) => p.theme.colors.foregroundDisabled};
    }
  }

  :link,
  :visited {
    color: rgb(0, 0, 238);
  }

  :focus {
    outline: ${(p) =>
      p.isTouchscreen ? 'rgb(77, 144, 254) dashed 0.25rem;' : 'none'};
  }

  select:disabled {
    opacity: 1;
  }

  /* Hide scrollbars as Chrome on Linux displays them by default. This style also hides scrollbars when printing. */
  ::-webkit-scrollbar {
    display: none;
  }

  /* TODO: Create a component for this instead. */
  .screen-reader-only {
    position: absolute !important; /* stylelint-disable-line declaration-no-important */
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(1px, 1px, 1px, 1px);
    clip-path: polygon(0 0, 0 0, 0 0);
  }

  /* TODO: Create components for these: */
  .print-only {
    display: none;
  }
  @media print {
    .print-only {
      display: block;
    }
    .no-print {
      display: none;
    }
  }
`;

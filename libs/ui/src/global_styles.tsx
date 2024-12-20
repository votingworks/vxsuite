import { createGlobalStyle, css } from 'styled-components';
import { isTouchscreen } from '@votingworks/types';
import { VX_DEFAULT_FONT_FAMILY_DECLARATION } from './fonts/font_family';
import { NORMALIZE_CSS } from './normalize.css';

// TODO(kofi): Move to ./ui_strings/audio_only.tsx once all relevant code is
// updated to use that component.
export const AUDIO_ONLY_STYLES = css`
  clip-path: polygon(0 0, 0 0, 0 0);
  clip: rect(1px, 1px, 1px, 1px);
  height: 1px;
  overflow: hidden;
  position: absolute !important;
  width: 1px;
`;

export interface GlobalStylesProps {
  hideCursor?: boolean;
  showScrollBars?: boolean;
}

const LEGACY_PRINT_STYLES = css`
  @media print {
    html {
      background: #fff;
      color: #000;
      font-size: 16px !important;
    }

    svg {
      color: black !important; /* Icons should be black in print */
    }
  }
`;

/**
 * Common global styling for VxSuite apps.
 *
 * TODO: Copied from old App.css files in the frontend packages - could probably
 * use some cleanup and de-duping with the normalize.css inlined below.
 *
 * TODO: Hardcode base64-encoded versions of our font files and reference here,
 * so that everything's centralized and we don't have to have duplicate
 * copies in each app's package.
 */
export const GlobalStyles = createGlobalStyle<GlobalStylesProps>`

${NORMALIZE_CSS}

  *,
  *::before,
  *::after {
    box-sizing: inherit;
    cursor: ${(p) =>
      /* istanbul ignore next */ p.hideCursor ? 'none !important' : undefined};
  }

  html {
    box-sizing: border-box;
    background: ${(p) => p.theme.colors.background};
    line-height: 1;
    color: ${(p) => p.theme.colors.onBackground};
    font-family: ${VX_DEFAULT_FONT_FAMILY_DECLARATION};
    font-size: ${(p) => p.theme.sizes.fontDefault}px;
    font-weight: ${(p) => p.theme.sizes.fontWeight.regular};
    -moz-osx-font-smoothing: grayscale;
    -webkit-font-smoothing: antialiased;
    user-select: none;
  }

  ${(p) => (p.theme.sizeMode === 'print' ? undefined : LEGACY_PRINT_STYLES)}

  body {
    margin: 0;
  }

  html,
  body,
  #root {
    height: 100%;
    overflow: hidden;
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

  input, textarea {
    cursor: text;
    border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid ${(p) =>
      p.theme.colors.outline};
    background: ${(p) => p.theme.colors.containerLow};
    padding: 0.5rem;
    line-height: ${(p) => p.theme.sizes.lineHeight};
    border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;

    &:focus {
      background: ${(p) => p.theme.colors.background};
    }

    &:disabled {
      background: ${(p) => p.theme.colors.container};
      border-style: dashed;
    }
  }

  select option {
    background-color: ${(p) => p.theme.colors.background};
    color: ${(p) => p.theme.colors.onBackground};

    &:disabled {
      background-color: ${(p) => p.theme.colors.container};
    }
  }

  :link,
  :visited {
    color: ${(p) => p.theme.colors.primary};
    font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};

    &:hover {
      filter: brightness(1.2);
    }
  }

  /* Create a CSS variable for the focus outline styling, that way it can be
   * applied manually as needed in some components that have abnormal focus
   * triggers (e.g. RadioGroup). */
  :root {
    --focus-outline: ${(p) =>
      isTouchscreen(p.theme.screenType)
        ? `${p.theme.colors.primary} dashed ${p.theme.sizes.bordersRem.medium}rem`
        : `${p.theme.colors.primary} solid ${p.theme.sizes.bordersRem.medium}rem`}
  }

  :focus-visible {
    outline: var(--focus-outline);
  }

  select:disabled {
    opacity: 1;
  }

  /* Hide scrollbars as Chrome on Linux displays them by default. */
  ::-webkit-scrollbar {
    ${(p) => (p.showScrollBars ? '' : 'display: none;')}
  }

  /* TODO(kofi): Update consumers to use the newer <AudioOnly> component. */
  .screen-reader-only {
    ${AUDIO_ONLY_STYLES}
  }
`;

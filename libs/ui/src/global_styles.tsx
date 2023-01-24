import { createGlobalStyle } from 'styled-components';

/**
 * Common global styling for VxSuite apps.
 *
 * TODO: Flesh out and vary based on selected pre-defined theme.
 */
export const GlobalStyles = createGlobalStyle`
  html {
    background: #edeff0;
    color: #263238;
    font-family: 'Vx Helvetica Neue', 'Noto Emoji', 'Helvetica Neue', sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
`;

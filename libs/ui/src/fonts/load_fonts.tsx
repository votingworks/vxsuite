/* istanbul ignore file - tested via integration tests. */

import {
  ROBOTO_REGULAR_FONT_DECLARATIONS,
  ROBOTO_ITALIC_FONT_DECLARATIONS,
} from './roboto';

export function loadFonts(): void {
  const fontDeclarations = document.createElement('style');
  fontDeclarations.setAttribute('type', 'text/css');
  fontDeclarations.innerHTML = [
    ROBOTO_REGULAR_FONT_DECLARATIONS,
    ROBOTO_ITALIC_FONT_DECLARATIONS,
  ].join('\n');

  document.head.appendChild(fontDeclarations);
}

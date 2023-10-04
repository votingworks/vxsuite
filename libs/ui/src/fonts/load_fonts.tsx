/* istanbul ignore file - tested via integration tests. */

import {
  ROBOTO_REGULAR_FONT_DECLARATIONS,
  ROBOTO_ITALIC_FONT_DECLARATIONS,
} from './roboto';

const VX_FONTS_NODE_ID = 'vx-font-declarations';

export function loadFonts(): void {
  const fontDeclarations = document.createElement('style');
  fontDeclarations.setAttribute('type', 'text/css');
  fontDeclarations.setAttribute('id', VX_FONTS_NODE_ID);
  fontDeclarations.innerHTML = [
    ROBOTO_REGULAR_FONT_DECLARATIONS,
    ROBOTO_ITALIC_FONT_DECLARATIONS,
  ].join('\n');

  document.head.appendChild(fontDeclarations);
}

export function unloadFonts(): void {
  const fontDeclarations = document.getElementById(VX_FONTS_NODE_ID);

  if (fontDeclarations && fontDeclarations.parentElement === document.head) {
    document.head.removeChild(fontDeclarations);
  }
}

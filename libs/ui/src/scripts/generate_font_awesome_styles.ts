import { join } from 'node:path';
import { generateFontAwesomeStyles } from '../fonts/generate_font_awesome_styles.js';

export function main(): void {
  generateFontAwesomeStyles(
    // Run from the compiled location (`build/scripts/`), generating a
    // checked-in source file, so the path points back into `src/`.
    join(import.meta.dirname, '../../src/fonts/font_awesome_styles.ts')
  );
}

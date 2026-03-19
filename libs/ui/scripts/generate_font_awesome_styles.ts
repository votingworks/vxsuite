import { join } from 'node:path';
import { generateFontAwesomeStyles } from '../src/fonts/generate_font_awesome_styles.js';

export function main(): void {
  generateFontAwesomeStyles(
    join(import.meta.dirname, '../src/fonts/font_awesome_styles.ts')
  );
}

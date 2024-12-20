import { join } from 'node:path';
import { generateFontAwesomeStyles } from '../src/fonts/generate_font_awesome_styles';

export function main(): void {
  generateFontAwesomeStyles(
    join(__dirname, '../src/fonts/font_awesome_styles.ts')
  );
}

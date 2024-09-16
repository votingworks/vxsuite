import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpNameSync } from 'tmp';
import { generateFontAwesomeStyles } from './generate_font_awesome_styles';

test('font_awesome_styles.ts is up to date (if not, run generate-font-awesome-styles)', () => {
  const actual = readFileSync(
    join(__dirname, './font_awesome_styles.ts'),
    'utf8'
  );
  const expectedPath = tmpNameSync();
  generateFontAwesomeStyles(expectedPath);
  const expected = readFileSync(expectedPath, 'utf8');

  expect(actual).toEqual(expected);
});

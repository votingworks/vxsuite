import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTemporaryFile } from '@votingworks/fixtures';
import { generateFontAwesomeStyles } from './generate_font_awesome_styles';

test('font_awesome_styles.ts is up to date (if not, run generate-font-awesome-styles)', () => {
  const actual = readFileSync(
    join(__dirname, './font_awesome_styles.ts'),
    'utf8'
  );
  const expectedPath = makeTemporaryFile();
  generateFontAwesomeStyles(expectedPath);
  const expected = readFileSync(expectedPath, 'utf8');

  expect(actual).toEqual(expected);
});

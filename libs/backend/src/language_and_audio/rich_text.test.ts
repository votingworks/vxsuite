import { expect, test } from 'vitest';

import { convertHtmlToAudioCues } from './rich_text';

test('convertHtmlToAudioCues', () => {
  expect(convertHtmlToAudioCues('This is HTML text')).toEqual(
    'This is HTML text'
  );
  expect(convertHtmlToAudioCues('<p>This is HTML text</p>')).toEqual(
    'This is HTML text'
  );
  expect(
    convertHtmlToAudioCues('<p>This is <s>Markdown</s> HTML text</p>')
  ).toEqual(
    'This is [begin strikethrough] Markdown [end strikethrough] HTML text'
  );
  expect(convertHtmlToAudioCues('<p>This is <u>HTML</u> text</p>')).toEqual(
    'This is [begin underline] HTML [end underline] text'
  );

  expect(
    convertHtmlToAudioCues(
      `This is a list:
<ol> <li>Item 1</li><li>Item 2</li><li>Item 3</li></ol>`
    )
  ).toEqual(`This is a list:
 1. Item 1
2. Item 2
3. Item 3`);

  expect(convertHtmlToAudioCues('This is an image: <img src="src" >')).toEqual(
    'This is an image: [image]'
  );

  expect(
    convertHtmlToAudioCues('This is also an image: <svg>foo bar</svg')
  ).toEqual('This is also an image: [image].');
});

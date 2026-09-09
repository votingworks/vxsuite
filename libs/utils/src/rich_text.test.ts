import { expect, test } from 'vitest';
import { sanitizeRichTextHtml } from './rich_text';

test('preserves rich text formatting', () => {
  expect(
    sanitizeRichTextHtml(
      '<p>Shall the town <strong>approve</strong> the <em>measure</em>?</p>' +
        '<ul><li>One</li></ul><table><tr><td>Cell</td></tr></table>' +
        '<img src="data:image/png;base64,abc" alt="Seal">'
    )
  ).toEqual(
    '<p>Shall the town <strong>approve</strong> the <em>measure</em>?</p>' +
      '<ul><li>One</li></ul><table><tr><td>Cell</td></tr></table>' +
      '<img src="data:image/png;base64,abc" alt="Seal" />'
  );
});

test('strips event handler attributes', () => {
  expect(
    sanitizeRichTextHtml(
      '<p onclick="steal()">Text</p><img src="x" onerror="steal()">'
    )
  ).toEqual('<p>Text</p><img src="x" />');
});

test('strips scripts', () => {
  expect(sanitizeRichTextHtml('<p>Text</p><script>steal()</script>')).toEqual(
    '<p>Text</p>'
  );
});

test('strips iframes', () => {
  expect(
    sanitizeRichTextHtml(
      '<iframe src="https://evil.example"></iframe><p>Text</p>'
    )
  ).toEqual('<p>Text</p>');
});

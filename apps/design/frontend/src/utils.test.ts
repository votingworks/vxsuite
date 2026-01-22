import { expect, test, describe } from 'vitest';
import {
  downloadFile,
  reorderElement,
  sanitizeTrailingNbspOnPaste,
} from './utils';

test('downloadFile cleans up temporary anchor tag', () => {
  downloadFile('http://localhost:1234/file.zip');
  expect(document.getElementsByTagName('a')).toHaveLength(0);
});

test('reorderElement', () => {
  expect(reorderElement([1], 0, 0)).toEqual([1]);
  expect(reorderElement([1, 2, 3], 0, 0)).toEqual([1, 2, 3]);
  expect(reorderElement([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
  expect(reorderElement([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
  expect(reorderElement([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
  expect(reorderElement([1, 2, 3], 2, 1)).toEqual([1, 3, 2]);
  expect(reorderElement([1, 2, 3], 2, 2)).toEqual([1, 2, 3]);
  expect(() => reorderElement([], 0, 0)).toThrow();
  expect(() => reorderElement([1, 2, 3], 0, 3)).toThrow();
  expect(() => reorderElement([1, 2, 3], 3, 0)).toThrow();
  expect(() => reorderElement([1, 2, 3], -1, 0)).toThrow();
  expect(() => reorderElement([1, 2, 3], 0, -1)).toThrow();
});

describe('sanitizeTrailingNbspOnPaste', () => {
  test('strips trailing nbsp and whitespace from paragraphs', () => {
    expect(sanitizeTrailingNbspOnPaste('<p>text  </p>')).toEqual('<p>text</p>');
  });

  test('strips trailing whitespace including regular spaces', () => {
    expect(sanitizeTrailingNbspOnPaste('<p>text      </p>')).toEqual(
      '<p>text</p>'
    );
  });

  test('strips trailing nbsp wrapped in a formatting tag from list items', () => {
    expect(sanitizeTrailingNbspOnPaste('<li><b>item  </b></li>')).toEqual(
      '<li><b>item</b></li>'
    );
  });

  test('strips trailing nbsp from table cells in a table', () => {
    // Table cells need to be in a table structure for DOMParser to preserve them
    // so the output includes <tbody> even if the input does not
    expect(
      sanitizeTrailingNbspOnPaste(
        '<table><tr><td>cell  </td><th>header  </th></tr></table>'
      )
    ).toEqual(
      '<table><tbody><tr><td>cell</td><th>header</th></tr></tbody></table>'
    );
  });

  test('preserves nbsp in the middle of content', () => {
    // Middle nbsp is preserved, output uses &nbsp; instead of unicode nbsp character
    expect(sanitizeTrailingNbspOnPaste('<p>text more text</p>')).toEqual(
      '<p>text&nbsp;more&nbsp;text</p>'
    );
  });

  test('handles multiple paragraphs with trailing nbsp', () => {
    expect(sanitizeTrailingNbspOnPaste('<p>para1  </p><p>para2  </p>')).toEqual(
      '<p>para1</p><p>para2</p>'
    );
  });

  test('handles real-world copy-paste from table', () => {
    // Trailing nbsp is stripped, middle nbsp preserved as &nbsp; entity
    const input = '<p>Year 2025-2026      $96,336           </p>';
    expect(sanitizeTrailingNbspOnPaste(input)).toEqual(
      '<p>Year 2025-2026&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; $96,336</p>'
    );
  });

  test('strips single trailing nbsp (empty cells in table)', () => {
    expect(
      sanitizeTrailingNbspOnPaste('<table><tr><td> </td></tr></table>')
    ).toEqual('<table><tbody><tr><td></td></tr></tbody></table>');
  });
});

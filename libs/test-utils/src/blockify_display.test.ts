// @vitest-environment jsdom
/* eslint-disable no-restricted-globals -- this test runs under jsdom */
import { expect, test } from 'vitest';
import './vitest_setup.js';

test.each([
  ['flex', 'display: inline', 'block'],
  ['inline-flex', 'display: inline-block', 'block'],
  ['grid', 'display: inline-flex', 'flex'],
  ['inline-grid', 'display: inline-grid', 'grid'],
  ['flex', 'display: inline-table', 'table'],
  ['flex', 'display: none', 'none'],
  ['block', 'display: inline', 'inline'],
  ['block', 'position: absolute', 'block'],
  ['block', 'position: fixed', 'block'],
  ['block', 'position: relative', 'inline'],
  ['block', 'float: left', 'block'],
  ['block', 'float: none', 'inline'],
])(
  'in a %s container, a span with `%s` has display %s',
  (parentDisplay, childStyle, expected) => {
    document.body.innerHTML = `<div style="display: ${parentDisplay}"><span style="color: red; ${childStyle}">a</span></div>`;

    const style = getComputedStyle(document.querySelector('span')!);
    expect(style.display).toEqual(expected);
    expect(style.getPropertyValue('display')).toEqual(expected);
    expect(style.getPropertyValue('color')).toEqual('rgb(255, 0, 0)');
    expect(style.color).toEqual('rgb(255, 0, 0)');
    expect(style.getPropertyPriority('color')).toEqual('');
    document.body.innerHTML = '';
  }
);

test('handles elements without a parent', () => {
  const span = document.createElement('span');
  expect(getComputedStyle(span).display).toEqual('inline');
});

test('separates the text of blockified elements in accessible names', () => {
  document.body.innerHTML =
    '<button><div style="display: flex"><span>All</span><span>78</span></div><span>space</span><span style="position: absolute">[AudioOnly]</span></button>';
  expect(document.querySelector('button')).toHaveAccessibleName(
    'All 78 space [AudioOnly]'
  );
  document.body.innerHTML = '';
});

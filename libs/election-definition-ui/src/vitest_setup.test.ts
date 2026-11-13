import { expect, test } from 'vitest';
import './vitest_setup.js';

test('mocks the DOM methods tiptap and react-flip-toolkit need', () => {
  const element = document.createElement('div');
  expect(element.getBoundingClientRect().toJSON()).toEqual({
    x: 0,
    y: 0,
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
  });
  const rects = element.getClientRects();
  expect(rects).toHaveLength(0);
  expect(rects.item(0)).toBeUndefined();
  expect(document.createRange().getClientRects()).toHaveLength(0);
  expect(document.createRange().getBoundingClientRect().width).toEqual(0);
  expect(document.elementFromPoint(0, 0)).toBeNull();
  expect(window.matchMedia('(prefers-reduced-motion)').matches).toEqual(false);
});

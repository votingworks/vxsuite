import React from 'react';
import { render } from '@testing-library/react';

import { Bubble } from './bubble_mark';

test('Mark has border by default', () => {
  const { container } = render(<Bubble />);
  const style = getComputedStyle(container.querySelector('span')!);
  expect(style.border).toEqual('1pt solid #000000');
  expect(style.background).toEqual('');
});

test('Mark has background when checked', () => {
  const { container } = render(<Bubble checked />);
  const style = getComputedStyle(container.querySelector('span')!);
  expect(style.background).toEqual('rgb(0, 0, 0)');
});

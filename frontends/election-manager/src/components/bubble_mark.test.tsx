import React from 'react';
import { render } from '@testing-library/react';

import { Bubble } from './bubble_mark';

test('Mark has border by default', () => {
  const { container } = render(<Bubble />);
  const style = getComputedStyle(container.querySelector('span')!);
  expect(style.border).toBe('1pt solid #000000');
  expect(style.background).toBe('');
});

test('Mark has background when cheked', () => {
  const { container } = render(<Bubble checked />);
  const style = getComputedStyle(container.querySelector('span')!);
  expect(style.background).toBe('rgb(0, 0, 0)');
});

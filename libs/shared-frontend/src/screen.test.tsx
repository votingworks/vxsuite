import React from 'react';
import { render } from '@testing-library/react';

import { Screen } from './screen';

describe('renders Screen', () => {
  test('with defaults', () => {
    const { container } = render(<Screen>Screen</Screen>);
    const screen = container.firstChild;
    expect(screen).toHaveStyleRule('flex-direction', 'column');
    expect(screen).toHaveStyleRule('height', '100%');
    expect(screen).not.toHaveStyleRule('background-color');
    expect(screen).toHaveStyleRule('display', 'none', {
      media: 'print',
    });
  });

  test('with white background', () => {
    const { container } = render(<Screen white>Screen</Screen>);
    const screen = container.firstChild;
    expect(screen).toHaveStyleRule('background-color', 'white');
  });

  test('with grey background', () => {
    const { container } = render(<Screen grey>Screen</Screen>);
    const screen = container.firstChild;
    expect(screen).toHaveStyleRule('background-color', '#edeff0');
  });

  test('with left nav', () => {
    const { container } = render(<Screen navLeft>Screen</Screen>);
    const screen = container.firstChild;
    expect(screen).toHaveStyleRule('flex-direction', 'row-reverse');
  });

  test('with right nav', () => {
    const { container } = render(<Screen navRight>Screen</Screen>);
    const screen = container.firstChild;
    expect(screen).toHaveStyleRule('flex-direction', 'row');
  });
});

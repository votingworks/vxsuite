import React from 'react';
import { render } from '@testing-library/react';
import 'jest-styled-components';

import { Main } from './main';

describe('renders Main', () => {
  test('with defaults', () => {
    const { container } = render(<Main>Main</Main>);
    const main = container.firstChild;
    expect(main).not.toHaveStyleRule('display');
    expect(main).toHaveStyleRule('flex', '1');
    expect(main).not.toHaveStyleRule('flex-direction');
    expect(main).not.toHaveStyleRule('justify-content');
    expect(main).not.toHaveStyleRule('align-items');
    expect(main).not.toHaveStyleRule('padding');
    expect(main).toHaveStyleRule('overflow', 'auto');
  });

  test('with padding and centered child', () => {
    const { container } = render(
      <Main padded centerChild>
        Main
      </Main>
    );
    const main = container.firstChild;
    expect(main).toHaveStyleRule('display', 'flex');
    expect(main).toHaveStyleRule('flex', '1');
    expect(main).toHaveStyleRule('flex-direction', 'column');
    expect(main).toHaveStyleRule('justify-content', 'center');
    expect(main).toHaveStyleRule('align-items', 'center');
    expect(main).toHaveStyleRule('padding', '1rem');
  });

  test('as a flexRow', () => {
    const { container } = render(<Main flexRow>Main</Main>);
    const main = container.firstChild;
    expect(main).toHaveStyleRule('display', 'flex');
    expect(main).toHaveStyleRule('flex', '1');
    expect(main).not.toHaveStyleRule('flex-direction');
    expect(main).not.toHaveStyleRule('justify-content');
    expect(main).not.toHaveStyleRule('align-items');
  });

  test('as a flexColumn', () => {
    const { container } = render(<Main flexColumn>Main</Main>);
    const main = container.firstChild;
    expect(main).toHaveStyleRule('display', 'flex');
    expect(main).toHaveStyleRule('flex', '1');
    expect(main).toHaveStyleRule('flex-direction', 'column');
    expect(main).not.toHaveStyleRule('justify-content');
    expect(main).not.toHaveStyleRule('align-items');
  });
});

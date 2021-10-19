import React from 'react';
import { render } from '@testing-library/react';

import { Main, MainChild } from './Main';

describe('renders Main', () => {
  test('with defaults', () => {
    const { container } = render(
      <Main>
        <MainChild>foo</MainChild>
      </Main>
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  test('with all non-default Main options and common MainChild options', () => {
    const { container } = render(
      <Main noOverflow padded>
        <MainChild center narrow>
          foo
        </MainChild>
      </Main>
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  test('with MainChild with no max width', () => {
    const { container } = render(
      <Main>
        <MainChild flexContainer maxWidth={false}>
          foo
        </MainChild>
      </Main>
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  test('with not centered content', () => {
    const { container } = render(
      <Main noOverflow>
        <MainChild centerHorizontal={false}>foo</MainChild>
      </Main>
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

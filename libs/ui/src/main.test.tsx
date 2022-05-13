import React from 'react';
import { render } from '@testing-library/react';
import 'jest-styled-components';

import { Main, MainChild, MainChildFlexRow } from './main';

describe('renders Main', () => {
  test('with defaults', () => {
    const { container, getByText } = render(
      <Main>
        <MainChild>MainChild</MainChild>
      </Main>
    );
    const main = container.firstChild;
    expect(main).toHaveStyleRule('overflow', 'auto');
    expect(main).not.toHaveStyleRule('padding');

    const child = getByText('MainChild');
    expect(child).not.toHaveStyleRule('display');
    expect(child).not.toHaveStyleRule('flex');
    expect(child).toHaveStyleRule('flex-direction', 'column');
    expect(child).toHaveStyleRule('max-width', '35rem');
  });

  test('with all non-default Main options and common MainChild options', () => {
    const { container, getByText } = render(
      <Main noOverflow padded>
        <MainChild center narrow>
          MainChild
        </MainChild>
      </Main>
    );
    const main = container.firstChild;
    expect(main).not.toHaveStyleRule('overflow');
    expect(main).toHaveStyleRule('padding', '1rem 0.5rem 2rem');

    const child = getByText('MainChild');
    expect(child).toHaveStyleRule('margin', 'auto');
    expect(child).toHaveStyleRule('max-width', '50%');
  });

  test('with MainChild with no max width', () => {
    const { getByText } = render(
      <Main>
        <MainChild flexContainer maxWidth={false}>
          MainChild
        </MainChild>
      </Main>
    );
    const child = getByText('MainChild');
    expect(child).toHaveStyleRule('display', 'flex');
    expect(child).toHaveStyleRule('flex', '1');
    expect(child).not.toHaveStyleRule('max-width');
  });

  test('with columns in the main child', () => {
    const { getByText } = render(
      <Main>
        <MainChildFlexRow>MainChildFlexRow</MainChildFlexRow>
      </Main>
    );
    expect(getByText('MainChildFlexRow')).not.toHaveStyleRule('flex-direction');
  });
});

import React from 'react';
import parseCssColor from 'parse-css-color';
import { render } from '@testing-library/react';

import { assert } from '@votingworks/basics';
import { AppBase } from './app_base';
import { makeTheme } from './themes/make_theme';

test('renders with defaults', () => {
  const { container } = render(
    <AppBase>
      <div>foo</div>
    </AppBase>
  );

  expect(container).toContainHTML('<div>foo</div>');

  const expectedTheme = makeTheme({
    colorMode: 'legacy',
    sizeMode: 'legacy',
  });

  const htmlNode = document.body.parentElement;
  assert(htmlNode);
  const computedStyles = window.getComputedStyle(htmlNode);

  expect(computedStyles.fontSize).toEqual(
    `${expectedTheme.sizes.fontDefault}px`
  );

  expect(parseCssColor(computedStyles.background)).toEqual(
    parseCssColor(expectedTheme.colors.background)
  );

  expect(parseCssColor(computedStyles.color)).toEqual(
    parseCssColor(expectedTheme.colors.foreground)
  );
});

// Doesn't seem possible to test the outline styles on focus within these
// jest-dom unit tests, so this just verifies content renders properly,
// structurally, and gives us coverage of the relevant path in the GlobalStyles
// component.
test('renders with touchscreen-sepcific styles', () => {
  const { container } = render(
    <AppBase isTouchscreen>
      <div>foo</div>
    </AppBase>
  );

  expect(container).toContainHTML('<div>foo</div>');
});

test('renders with legacy font sizes', () => {
  const { container } = render(
    <AppBase legacyBaseFontSizePx={48} legacyPrintFontSizePx={18}>
      <div>foo</div>
    </AppBase>
  );

  expect(container).toContainHTML('<div>foo</div>');

  const htmlNode = document.body.parentElement;
  assert(htmlNode);
  const computedStyles = window.getComputedStyle(htmlNode);

  expect(computedStyles.fontSize).toEqual('48px');
  // TODO: Figure out how to test @media print styles.
});

test('renders with selected themes', () => {
  const { container } = render(
    <AppBase colorMode="contrastHighDark" sizeMode="xl">
      <div>foo</div>
    </AppBase>
  );

  expect(container).toContainHTML('<div>foo</div>');

  const expectedTheme = makeTheme({
    colorMode: 'contrastHighDark',
    sizeMode: 'xl',
  });

  const htmlNode = document.body.parentElement;
  assert(htmlNode);
  const computedStyles = window.getComputedStyle(htmlNode);

  expect(computedStyles.fontSize).toEqual(
    `${expectedTheme.sizes.fontDefault}px`
  );

  expect(parseCssColor(computedStyles.background)).toEqual(
    parseCssColor(expectedTheme.colors.background)
  );

  expect(parseCssColor(computedStyles.color)).toEqual(
    parseCssColor(expectedTheme.colors.foreground)
  );
});

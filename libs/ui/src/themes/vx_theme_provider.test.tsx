import React from 'react';
import { DefaultTheme, ThemeContext } from 'styled-components';

import { render } from '@testing-library/react';
import { VxThemeProvider } from './vx_theme_provider';
import { makeTheme } from './make_theme';

let currentTheme: DefaultTheme;

function TestThemeConsumer(): JSX.Element {
  currentTheme = React.useContext(ThemeContext);

  return <div>foo</div>;
}

test('renders child nodes', () => {
  const { container } = render(
    <VxThemeProvider>
      <TestThemeConsumer />
    </VxThemeProvider>
  );

  expect(container).toContainHTML('<div>foo</div>');
});

test('uses defaults when no params specified', () => {
  render(
    <VxThemeProvider>
      <TestThemeConsumer />
    </VxThemeProvider>
  );

  expect(currentTheme).toEqual(makeTheme({}));
});

test('sets theme according to specified params', () => {
  render(
    <VxThemeProvider
      colorMode="contrastMedium"
      sizeMode="touchMedium"
      screenType="elo15"
    >
      <VxThemeProvider
        colorMode="contrastLow"
        sizeMode="touchSmall"
        screenType="elo13"
      >
        <TestThemeConsumer />
      </VxThemeProvider>
    </VxThemeProvider>
  );

  expect(currentTheme).toEqual(
    makeTheme({
      colorMode: 'contrastLow',
      sizeMode: 'touchSmall',
      screenType: 'elo13',
    })
  );
});

test('inherits unspecified params from parent', () => {
  const { rerender } = render(
    <VxThemeProvider
      colorMode="contrastMedium"
      sizeMode="touchMedium"
      screenType="elo15"
    >
      <VxThemeProvider>
        <TestThemeConsumer />
      </VxThemeProvider>
    </VxThemeProvider>
  );

  expect(currentTheme).toEqual(
    makeTheme({
      colorMode: 'contrastMedium',
      sizeMode: 'touchMedium',
      screenType: 'elo15',
    })
  );

  rerender(
    <VxThemeProvider
      colorMode="contrastMedium"
      sizeMode="touchMedium"
      screenType="elo15"
    >
      <VxThemeProvider sizeMode="touchExtraLarge">
        <TestThemeConsumer />
      </VxThemeProvider>
    </VxThemeProvider>
  );

  expect(currentTheme).toEqual(
    makeTheme({
      colorMode: 'contrastMedium',
      sizeMode: 'touchExtraLarge',
      screenType: 'elo15',
    })
  );
});

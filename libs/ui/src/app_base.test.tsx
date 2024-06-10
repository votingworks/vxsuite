import React from 'react';
import parseCssColor from 'parse-css-color';
import { assert } from '@votingworks/basics';
import { ServerStyleSheet, ThemeConsumer } from 'styled-components';
import { UiTheme } from '@votingworks/types';
import { act, render } from '@testing-library/react';

import { AppBaseProps, AppBase as OriginalAppBase } from './app_base';
import { makeTheme } from './themes/make_theme';
import {
  VoterSettingsManagerContext,
  VoterSettingsManagerContextInterface,
} from './voter_settings_manager_context';

function AppBase(props: AppBaseProps) {
  return <OriginalAppBase {...props} disableFontsForTests />;
}

// Doesn't seem possible to test the outline styles on focus within these
// jest-dom unit tests, so this just verifies content renders properly,
// structurally, and gives us coverage of the relevant path in the GlobalStyles
// component.
test('renders with touchscreen-specific styles', () => {
  const { container } = render(
    <AppBase
      defaultColorMode="contrastMedium"
      defaultSizeMode="touchSmall"
      screenType="elo13"
    >
      <div>foo</div>
    </AppBase>
  );

  expect(container).toContainHTML('<div>foo</div>');
});

// Not sure how to test the actual scrollbars styling, so just rendering for
// coverage
test('renders with showScrollBars=true', () => {
  const { container } = render(
    <AppBase
      defaultColorMode="contrastMedium"
      defaultSizeMode="touchSmall"
      showScrollBars
    >
      <div>foo</div>
    </AppBase>
  );
  expect(container).toContainHTML('<div>foo</div>');
});

test('renders with selected themes', () => {
  const { container } = render(
    <AppBase
      defaultColorMode="contrastHighDark"
      defaultSizeMode="touchExtraLarge"
    >
      <div>foo</div>
    </AppBase>
  );

  expect(container).toContainHTML('<div>foo</div>');

  const expectedTheme = makeTheme({
    colorMode: 'contrastHighDark',
    sizeMode: 'touchExtraLarge',
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
    parseCssColor(expectedTheme.colors.onBackground)
  );
});

test('adds legacy print media styles when using non-print theme', () => {
  const styleSheet = new ServerStyleSheet();

  render(
    styleSheet.collectStyles(
      <AppBase defaultColorMode="desktop" defaultSizeMode="desktop">
        <div>foo</div>
      </AppBase>
    )
  );

  expect(styleSheet.getStyleTags()).toMatch('font-size:16px !important');
});

test('skips legacy print media styles when using print theme', () => {
  const styleSheet = new ServerStyleSheet();

  render(
    styleSheet.collectStyles(
      <AppBase defaultColorMode="print" defaultSizeMode="print">
        <div>foo</div>
      </AppBase>
    )
  );

  expect(styleSheet.getStyleTags()).not.toMatch('font-size:16px !important');
});

test('implements ThemeManagerContext interface', () => {
  let currentTheme: UiTheme | null = null;
  let manager: VoterSettingsManagerContextInterface | null = null;

  function TestComponent(): JSX.Element {
    manager = React.useContext(VoterSettingsManagerContext);

    return (
      <ThemeConsumer>
        {(theme) => {
          currentTheme = theme;
          return <div>foo</div>;
        }}
      </ThemeConsumer>
    );
  }

  render(
    <AppBase defaultColorMode="contrastLow" defaultSizeMode="touchLarge">
      <TestComponent />
    </AppBase>
  );

  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<UiTheme>>({
      colorMode: 'contrastLow',
      sizeMode: 'touchLarge',
    })
  );

  act(() => manager?.setColorMode('contrastHighDark'));

  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<UiTheme>>({
      colorMode: 'contrastHighDark',
      sizeMode: 'touchLarge',
    })
  );

  act(() => manager?.setSizeMode('touchSmall'));

  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<UiTheme>>({
      colorMode: 'contrastHighDark',
      sizeMode: 'touchSmall',
    })
  );

  act(() => manager?.resetThemes());

  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<UiTheme>>({
      colorMode: 'contrastLow',
      sizeMode: 'touchLarge',
    })
  );
});

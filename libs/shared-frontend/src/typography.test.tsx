import React from 'react';
import { render, screen } from '@testing-library/react';

import { Caption, Font, H1, H2, H3, H4, H5, H6, P, Pre } from './typography';
import { AppBase } from './app_base';
import { makeTheme } from './themes/make_theme';

for (const Component of [Caption, Font, P, Pre]) {
  test(`renders <${Component.name}>`, () => {
    const theme = makeTheme({
      colorMode: 'contrastHighDark',
      sizeMode: 'm',
    });
    render(
      <AppBase colorMode="contrastHighDark" sizeMode="m">
        <Component>regular text</Component>
        <Component weight="bold">bold text</Component>
        <Component italic weight="light">
          italic text
        </Component>
        <Component align="center">center-aligned text</Component>
        <Component noWrap>no-wrap text</Component>
      </AppBase>
    );

    expect(screen.getByText('regular text')).toHaveStyle({
      'font-style': undefined,
      'white-space': Component.name === 'Pre' ? 'pre-wrap' : undefined,
    });

    expect(screen.getByText('bold text')).toHaveStyle({
      'font-style': undefined,
      'font-weight': theme.sizes.fontWeight.bold,
    });

    expect(screen.getByText('italic text')).toHaveStyle({
      'font-style': 'italic',
      'font-weight': theme.sizes.fontWeight.light,
    });

    expect(screen.getByText('center-aligned text')).toHaveStyle({
      'text-align': 'center',
    });

    expect(screen.getByText('no-wrap text')).toHaveStyle({
      'white-space': Component.name === 'Pre' ? 'pre' : 'nowrap',
    });
  });
}

for (const Heading of [H1, H2, H3, H4, H5, H6]) {
  test(`renders <${Heading.name}>`, () => {
    const theme = makeTheme({
      colorMode: 'contrastHighLight',
      sizeMode: 'xl',
    });
    render(
      <AppBase colorMode="contrastHighLight" sizeMode="xl">
        <Heading>regular heading</Heading>
        <Heading as="h1">heading with modified semantics</Heading>
        <Heading italic>italic heading</Heading>
        <Heading align="center">center-aligned heading</Heading>
        <Heading noWrap>no-wrap heading</Heading>
      </AppBase>
    );

    const { headingsRem } = theme.sizes;
    const expectedSizeRem =
      Heading === H1
        ? headingsRem.h1
        : Heading === H2
        ? headingsRem.h2
        : Heading === H3
        ? headingsRem.h3
        : Heading === H4
        ? headingsRem.h4
        : Heading === H5
        ? headingsRem.h5
        : Heading === H6
        ? headingsRem.h6
        : 0;

    const regularHeading = screen.getByText('regular heading');
    expect(regularHeading).toHaveStyle({
      'font-size': `${expectedSizeRem}rem`,
    });

    const modifiedSemanticHeading = screen.getByText(
      'heading with modified semantics'
    );
    expect(modifiedSemanticHeading.tagName).toEqual('H1');
    expect(modifiedSemanticHeading).toHaveStyle({
      'font-size': `${expectedSizeRem}rem`,
    });

    expect(screen.getByText('italic heading')).toHaveStyle({
      'font-style': 'italic',
    });

    expect(screen.getByText('center-aligned heading')).toHaveStyle({
      'text-align': 'center',
    });

    expect(screen.getByText('no-wrap heading')).toHaveStyle({
      'white-space': 'nowrap',
    });
  });
}

for (const Component of [Caption, Font, P, Pre, H1, H2, H3, H4, H5, H6]) {
  test(`renders colored <${Component.name}>`, () => {
    const theme = makeTheme({
      colorMode: 'contrastMedium',
      sizeMode: 'l',
    });
    render(
      <AppBase colorMode="contrastMedium" sizeMode="l">
        <Component color="danger">danger color text</Component>
        <Component color="default">default color text</Component>
        <Component color="success">success color text</Component>
        <Component color="warning">warning color text</Component>
      </AppBase>
    );

    expect(screen.getByText('danger color text')).toHaveStyle({
      color: theme.colors.accentDanger,
    });

    expect(screen.getByText('default color text')).toHaveStyle({
      color: theme.colors.foreground,
    });

    expect(screen.getByText('success color text')).toHaveStyle({
      color: theme.colors.accentSuccess,
    });

    expect(screen.getByText('warning color text')).toHaveStyle({
      color: theme.colors.accentWarning,
    });
  });
}

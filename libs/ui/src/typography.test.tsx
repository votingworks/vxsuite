import React from 'react';
import { render as renderWithoutTheme } from '@testing-library/react';
import { render, screen } from '../test/react_testing_library';

import {
  Caption,
  Font,
  H1,
  H2,
  H3,
  H4,
  H5,
  H6,
  P,
  RichText,
} from './typography';
import { makeTheme } from './themes/make_theme';

for (const Component of [Caption, Font, P]) {
  test(`renders <${Component.name}>`, () => {
    const theme = makeTheme({
      colorMode: 'contrastHighDark',
      sizeMode: 'touchMedium',
    });
    render(
      <React.Fragment>
        <Component>regular text</Component>
        <Component weight="bold">bold text</Component>
        <Component italic weight="light">
          italic text
        </Component>
        <Component align="center">center-aligned text</Component>
        <Component noWrap>no-wrap text</Component>
      </React.Fragment>,
      { vxTheme: { colorMode: 'contrastHighDark', sizeMode: 'touchMedium' } }
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
      sizeMode: 'touchExtraLarge',
    });
    render(
      <React.Fragment>
        <Heading>regular heading</Heading>
        <Heading as="h3">heading with modified semantics</Heading>
        <Heading italic>italic heading</Heading>
        <Heading align="center">center-aligned heading</Heading>
        <Heading noWrap>no-wrap heading</Heading>
      </React.Fragment>,
      {
        vxTheme: {
          colorMode: 'contrastHighLight',
          sizeMode: 'touchExtraLarge',
        },
      }
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
    if (Heading === H1) {
      // H1 receives styling from normalize.css. In production, the styling is
      // always resolved in favor of our own global styles, but in tests, the
      // style is resolved in favor of normalize.css.
      //
      // TODO: Dedupe normalize.css and our own global styles to avoid
      // unpredictable styling.
      expect(regularHeading).toHaveStyle({
        'font-size': `2em`,
      });
    } else {
      expect(regularHeading).toHaveStyle({
        'font-size': `${expectedSizeRem}rem`,
      });
    }

    const modifiedSemanticHeading = screen.getByText(
      'heading with modified semantics'
    );
    expect(modifiedSemanticHeading.tagName).toEqual('H3');
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

test('RichText uses theme', () => {
  const theme = makeTheme({
    colorMode: 'contrastHighDark',
    sizeMode: 'touchMedium',
  });
  render(
    <RichText>
      <table>
        <thead>
          <tr>
            <th>table header</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>table cell</td>
          </tr>
        </tbody>
      </table>
    </RichText>,
    { vxTheme: theme }
  );

  expect(screen.getByText('table header')).toHaveStyle({
    background: theme.colors.container,
  });
  expect(screen.getByText('table cell')).toHaveStyle({
    borderWidth: `${theme.sizes.bordersRem.thin}rem`,
    borderColor: theme.colors.outline,
  });
});

test('RichText works without a theme using props instead', () => {
  renderWithoutTheme(
    <RichText
      tableBorderWidth="1px"
      tableBorderColor="red"
      tableHeaderBackgroundColor="blue"
    >
      <table>
        <thead>
          <tr>
            <th>table header</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>table cell</td>
          </tr>
        </tbody>
      </table>
    </RichText>
  );

  expect(screen.getByText('table header')).toHaveStyle({
    background: 'blue',
  });
  expect(screen.getByText('table cell')).toHaveStyle({
    borderWidth: '1px',
    borderColor: 'red',
  });
});

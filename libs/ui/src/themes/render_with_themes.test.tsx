import React from 'react';
import { render } from '@testing-library/react';

import { renderWithThemes } from './render_with_themes';
import { H1, P } from '../typography';
import { makeTheme } from './make_theme';

test('renders theme-dependent component successfully', () => {
  expect(() =>
    render(
      <div>
        <H1>This component requires a styled-components theme context.</H1>
        <P>So does this one.</P>
      </div>
    )
  ).toThrow();

  expect(() =>
    renderWithThemes(
      <div>
        <H1>This component requires a styled-components theme context.</H1>
        <P>So does this one.</P>
      </div>
    )
  ).not.toThrow();
});

test('renders with specified theme settings', () => {
  const lowContrastTheme = makeTheme({
    colorMode: 'contrastLow',
    sizeMode: 'xl',
  });

  const { getByText } = renderWithThemes(<P color="warning">Warning text</P>, {
    vxTheme: {
      colorMode: 'contrastLow',
      sizeMode: 'xl',
    },
  });

  expect(getByText('Warning text')).toHaveStyle({
    color: lowContrastTheme.colors.accentWarning,
  });
});

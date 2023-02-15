import React from 'react';
import { render } from '@testing-library/react';

import { renderWithThemes } from './render_with_themes';
import { H1, P } from '../typography';

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

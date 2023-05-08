import React from 'react';
import { DefaultTheme } from 'styled-components';
import { render } from '../../test/react_testing_library';
import { useCurrentTheme } from './use_current_theme';

test('useCurrentTheme', () => {
  let currentTheme: DefaultTheme | null = null;

  function TestComponent(): JSX.Element {
    currentTheme = useCurrentTheme();

    return <div>foo</div>;
  }

  render(<TestComponent />, {
    vxTheme: { colorMode: 'contrastLow', sizeMode: 'xl' },
  });

  expect(currentTheme).toEqual(
    expect.objectContaining({ colorMode: 'contrastLow', sizeMode: 'xl' })
  );
});

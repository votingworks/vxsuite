import React from 'react';
import { UiTheme } from '@votingworks/types';
import { ThemeConsumer } from 'styled-components';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../test/react_testing_library';
import { SizeSettings } from './size_settings';
import { H1 } from '../typography';

test('renders with default size options', () => {
  render(<SizeSettings />, {
    vxTheme: { colorMode: 'contrastLow', sizeMode: 'l' },
  });

  screen.getByRole('radio', {
    name: /small/i,
    checked: false,
  });

  screen.getByRole('radio', {
    name: /medium/i,
    checked: false,
  });

  screen.getByRole('radio', {
    name: /large/i,
    checked: true,
  });

  screen.getByRole('radio', {
    name: /extra-large/i,
    checked: false,
  });
});

test('renders with specified size options', () => {
  render(<SizeSettings sizeModes={['m', 'l']} />, {
    vxTheme: { colorMode: 'contrastLow', sizeMode: 'l' },
  });

  expect(screen.queryAllByRole('radio')).toHaveLength(2);

  screen.getByRole('radio', {
    name: /medium/i,
    checked: false,
  });

  screen.getByRole('radio', {
    name: /large/i,
    checked: true,
  });
});

test('option selections trigger theme updates', () => {
  let currentTheme: UiTheme | null = null;

  function TestComponent(): JSX.Element {
    return (
      <ThemeConsumer>
        {(theme) => {
          currentTheme = theme;
          return (
            <div>
              <H1>Foo</H1>
              <SizeSettings />
            </div>
          );
        }}
      </ThemeConsumer>
    );
  }

  render(<TestComponent />, {
    vxTheme: { colorMode: 'contrastHighDark', sizeMode: 'l' },
  });

  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<UiTheme>>({
      colorMode: 'contrastHighDark',
      sizeMode: 'l',
    })
  );

  userEvent.click(screen.getByRole('radio', { name: /small/i }));

  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<UiTheme>>({
      colorMode: 'contrastHighDark',
      sizeMode: 's',
    })
  );
});

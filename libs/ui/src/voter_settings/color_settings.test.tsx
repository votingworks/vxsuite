import { UiTheme } from '@votingworks/types';
import { ThemeConsumer } from 'styled-components';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../test/react_testing_library';
import { ColorSettings } from './color_settings';
import { H1 } from '../typography';

test('renders with default color options', () => {
  render(<ColorSettings />, {
    vxTheme: { colorMode: 'contrastLow', sizeMode: 'touchLarge' },
  });

  // contractHighDark:
  screen.getByRole('radio', {
    name: /white text.+black background/i,
    checked: false,
  });

  // contrastLow:
  screen.getByRole('radio', {
    name: /gray text.+dark background/i,
    checked: true,
  });

  // contrastMedium:
  screen.getByRole('radio', {
    name: /dark text.+light background/i,
    checked: false,
  });

  // contrastHighLight:
  screen.getByRole('radio', {
    name: /black text.+white background/i,
    checked: false,
  });
});

test('renders with specified color options', () => {
  render(<ColorSettings colorModes={['contrastLow', 'contrastMedium']} />, {
    vxTheme: { colorMode: 'contrastLow', sizeMode: 'touchLarge' },
  });

  expect(screen.queryAllByRole('radio')).toHaveLength(2);

  // contrastLow:
  screen.getByRole('radio', {
    name: /gray text.+dark background/i,
    checked: true,
  });

  // contrastMedium:
  screen.getByRole('radio', {
    name: /dark text.+light background/i,
    checked: false,
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
              <ColorSettings />
            </div>
          );
        }}
      </ThemeConsumer>
    );
  }

  render(<TestComponent />, {
    vxTheme: { colorMode: 'contrastHighDark', sizeMode: 'touchLarge' },
  });

  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<UiTheme>>({
      colorMode: 'contrastHighDark',
      sizeMode: 'touchLarge',
    })
  );

  userEvent.click(
    screen.getByRole('radio', { name: /gray text.+dark background/i })
  );

  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<UiTheme>>({
      colorMode: 'contrastLow',
      sizeMode: 'touchLarge',
    })
  );
});

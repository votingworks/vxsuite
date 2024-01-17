import userEvent from '@testing-library/user-event';
import { ThemeConsumer } from 'styled-components';
import { UiTheme } from '@votingworks/types';
import { render, screen } from '../../test/react_testing_library';
import { DisplaySettings } from '.';

test('renders expected subcomponents', () => {
  render(<DisplaySettings onClose={jest.fn()} />);

  screen.getByRole('heading', { name: /Display Settings/i });
  screen.getByRole('tablist', { name: /Display settings/i });
  screen.getByRole('tabpanel');
  screen.getByRole('radiogroup', { name: 'Color Contrast Settings' });
});

test('changes tab pane on tab bar events', () => {
  render(<DisplaySettings onClose={jest.fn()} />);

  screen.getByRole('radiogroup', { name: 'Color Contrast Settings' });

  userEvent.click(screen.getByRole('tab', { name: /size/i }));

  screen.getByRole('radiogroup', { name: 'Text Size Settings' });

  userEvent.click(screen.getByRole('tab', { name: /accessibility modes/i }));

  screen.getByRole('button', { name: 'Enable Audio-Only Mode' });
});

test('resets button resets global theme', () => {
  let currentTheme: UiTheme | null = null;

  function TestComponent(): JSX.Element {
    return (
      <ThemeConsumer>
        {(theme) => {
          currentTheme = theme;
          return <DisplaySettings onClose={jest.fn()} />;
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

  userEvent.click(screen.getByRole('tab', { name: /color/i }));
  userEvent.click(screen.getByRole('radio', { name: /gray text/i }));

  userEvent.click(screen.getByRole('tab', { name: /size/i }));
  userEvent.click(screen.getByRole('radio', { name: /small/i }));

  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<UiTheme>>({
      colorMode: 'contrastLow',
      sizeMode: 'touchSmall',
    })
  );

  userEvent.click(screen.getButton('Reset'));

  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<UiTheme>>({
      colorMode: 'contrastHighDark',
      sizeMode: 'touchLarge',
    })
  );
});

test('done button fires onClose event', () => {
  const onClose = jest.fn();
  render(<DisplaySettings onClose={onClose} />);

  expect(onClose).not.toHaveBeenCalled();

  userEvent.click(screen.getButton('Done'));

  expect(onClose).toHaveBeenCalled();
});

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

test('changes tab pane on tab bar events', async () => {
  render(<DisplaySettings onClose={jest.fn()} />);

  screen.getByRole('radiogroup', { name: 'Color Contrast Settings' });

  await userEvent.click(screen.getByRole('tab', { name: /size/i }));

  screen.getByRole('radiogroup', { name: 'Text Size Settings' });
});

test('resets button resets global theme', async () => {
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
    vxTheme: { colorMode: 'contrastHighDark', sizeMode: 'l' },
  });

  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<UiTheme>>({
      colorMode: 'contrastHighDark',
      sizeMode: 'l',
    })
  );

  await userEvent.click(screen.getByRole('tab', { name: /color/i }));
  await userEvent.click(screen.getByRole('radio', { name: /gray text/i }));

  await userEvent.click(screen.getByRole('tab', { name: /size/i }));
  await userEvent.click(screen.getByRole('radio', { name: /small/i }));

  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<UiTheme>>({
      colorMode: 'contrastLow',
      sizeMode: 's',
    })
  );

  await userEvent.click(screen.getButton('Reset'));

  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<UiTheme>>({
      colorMode: 'contrastHighDark',
      sizeMode: 'l',
    })
  );
});

test('done button fires onClose event', async () => {
  const onClose = jest.fn();
  render(<DisplaySettings onClose={onClose} />);

  expect(onClose).not.toHaveBeenCalled();

  await userEvent.click(screen.getButton('Done'));

  expect(onClose).toHaveBeenCalled();
});

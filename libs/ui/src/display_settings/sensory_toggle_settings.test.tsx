import { UiTheme } from '@votingworks/types';
import { ThemeConsumer } from 'styled-components';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../test/react_testing_library';
import { SensoryToggleSettings } from './sensory_toggle_settings';

test('visual mode is disabled when button is pressed', () => {
  let currentTheme: UiTheme | null = null;

  function TestComponent(): JSX.Element {
    return (
      <ThemeConsumer>
        {(theme) => {
          currentTheme = theme;
          return <SensoryToggleSettings />;
        }}
      </ThemeConsumer>
    );
  }

  render(<TestComponent />, {
    vxTheme: { isVisualModeDisabled: false },
  });

  expect(currentTheme!.isVisualModeDisabled).toEqual(false);
  userEvent.click(screen.getByText('Enable Audio-Only Mode'));
  expect(currentTheme!.isVisualModeDisabled).toEqual(true);
  screen.getByRole('button', { name: 'Exit Audio-Only Mode' });
});

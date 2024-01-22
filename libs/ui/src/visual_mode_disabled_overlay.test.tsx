import { UiTheme } from '@votingworks/types';
import { ThemeConsumer } from 'styled-components';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../test/react_testing_library';
import { VisualModeDisabledOverlay } from '.';

test('updates context isVisualModeDisabled when button is pressed', () => {
  let currentTheme: UiTheme | null = null;

  function TestComponent(): JSX.Element {
    return (
      <ThemeConsumer>
        {(theme) => {
          currentTheme = theme;
          return <VisualModeDisabledOverlay />;
        }}
      </ThemeConsumer>
    );
  }

  render(<TestComponent />, {
    vxTheme: {
      isVisualModeDisabled: true,
    },
  });

  expect(currentTheme!.isVisualModeDisabled).toEqual(true);
  userEvent.click(screen.getAllByText('Exit Audio-Only Mode')[0]);
  expect(currentTheme!.isVisualModeDisabled).toEqual(false);
});

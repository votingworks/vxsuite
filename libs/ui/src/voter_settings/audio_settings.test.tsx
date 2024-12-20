import { UiTheme } from '@votingworks/types';
import { ThemeConsumer } from 'styled-components';
import userEvent from '@testing-library/user-event';
import { act, screen, waitFor } from '../../test/react_testing_library';
import { AudioSettings } from './audio_settings';
import { newTestContext } from '../../test/test_context';

const MOCK_TOGGLE_AUDIO_BUTTON_TEST_ID = 'mockToggleAudioButton';

jest.mock('../ui_strings', (): typeof import('../ui_strings') => ({
  ...jest.requireActual('../ui_strings'),
  ToggleAudioButton: jest.fn(() => (
    <div data-testid={MOCK_TOGGLE_AUDIO_BUTTON_TEST_ID} />
  )),
}));

test('renders audio toggle button', async () => {
  const { render } = newTestContext();

  render(<AudioSettings onEnterAudioOnlyMode={jest.fn()} />);

  await screen.findByTestId(MOCK_TOGGLE_AUDIO_BUTTON_TEST_ID);
});

test('visual mode is disabled when button is pressed', async () => {
  const { getAudioContext, render } = newTestContext();

  let currentTheme: UiTheme | null = null;
  const onEnterAudioOnlyMode = jest.fn();

  function TestComponent(): JSX.Element {
    return (
      <ThemeConsumer>
        {(theme) => {
          currentTheme = theme;
          return <AudioSettings onEnterAudioOnlyMode={onEnterAudioOnlyMode} />;
        }}
      </ThemeConsumer>
    );
  }

  render(<TestComponent />, {
    vxTheme: { isVisualModeDisabled: false },
  });

  // Wait for delayed render after translations are fetched:
  await screen.findByText('Enable Audio-Only Mode');

  // Start off with audio disabled to verify it's re-enabled when entering
  // audio-only mode:
  act(() => getAudioContext()!.setIsEnabled(false));
  await waitFor(() => expect(getAudioContext()!.isEnabled).toEqual(false));

  expect(currentTheme!.isVisualModeDisabled).toEqual(false);
  expect(onEnterAudioOnlyMode).not.toHaveBeenCalled();

  userEvent.click(screen.getButton('Enable Audio-Only Mode'));

  expect(currentTheme!.isVisualModeDisabled).toEqual(true);
  screen.getButton('Exit Audio-Only Mode');
  expect(onEnterAudioOnlyMode).toHaveBeenCalled();
  expect(getAudioContext()!.isEnabled).toEqual(true);
});

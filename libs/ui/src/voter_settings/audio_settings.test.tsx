import { describe, expect, test, vi } from 'vitest';
import { UiTheme } from '@votingworks/types';
import { ThemeConsumer } from 'styled-components';
import userEvent from '@testing-library/user-event';
import { mockUseAudioControls } from '@votingworks/test-utils';
import { assertDefined } from '@votingworks/basics';
import { act, screen, waitFor } from '../../test/react_testing_library';
import { AudioSettings } from './audio_settings';
import { newTestContext } from '../../test/test_context';
import { AudioVolume } from '../ui_strings/audio_volume';

const MOCK_TOGGLE_AUDIO_BUTTON_TEST_ID = 'mockToggleAudioButton';

vi.mock(import('../ui_strings/index.js'), async (importActual) => ({
  ...(await importActual()),
  ToggleAudioButton: vi.fn(() => (
    <div data-testid={MOCK_TOGGLE_AUDIO_BUTTON_TEST_ID} />
  )),
}));

const mockAudioControls = mockUseAudioControls(vi.fn);
vi.mock(import('../hooks/use_audio_controls.js'), async (importActual) => ({
  ...(await importActual()),
  useAudioControls: () => mockAudioControls,
}));

test('renders audio toggle button', async () => {
  const { render } = newTestContext();

  render(<AudioSettings onEnterAudioOnlyMode={vi.fn()} />);

  await screen.findByTestId(MOCK_TOGGLE_AUDIO_BUTTON_TEST_ID);
});

test('visual mode is disabled when button is pressed', async () => {
  const { getAudioContext, render } = newTestContext();

  let currentTheme: UiTheme | null = null;
  const onEnterAudioOnlyMode = vi.fn();

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
  await waitFor(() => expect(getAudioContext()!.isEnabled).toEqual(false), {
    timeout: 2000,
  });

  expect(currentTheme!.isVisualModeDisabled).toEqual(false);
  expect(onEnterAudioOnlyMode).not.toHaveBeenCalled();

  userEvent.click(screen.getButton('Enable Audio-Only Mode'));

  expect(currentTheme!.isVisualModeDisabled).toEqual(true);
  screen.getButton('Exit Audio-Only Mode');
  expect(onEnterAudioOnlyMode).toHaveBeenCalled();
  expect(mockAudioControls.setIsEnabled.mock.calls).toEqual([[true]]);
});

describe('volume controls', () => {
  test('renders current volume level', async () => {
    const { getAudioContext, render } = newTestContext();

    render(<AudioSettings onEnterAudioOnlyMode={vi.fn()} />);
    await screen.findByText(/volume:/i);

    screen.getButton(/50% volume.+increase.+volume/i);
    screen.getButton(/50% volume.+decrease.+volume/i);

    const ctx = assertDefined(getAudioContext());
    act(() => ctx.setVolume(AudioVolume.MAXIMUM));
    screen.getButton(/maximum volume.+increase.+volume/i);
    screen.getButton(/maximum volume.+decrease.+volume/i);
  });

  test('updates audio context', async () => {
    const { render } = newTestContext();

    render(<AudioSettings onEnterAudioOnlyMode={vi.fn()} />);
    await screen.findByText(/volume:/i);

    const btnIncrease = screen.getButton(/50% volume.+increase.+volume/i);
    expect(mockAudioControls.increaseVolume).not.toHaveBeenCalled();
    userEvent.click(btnIncrease);
    userEvent.click(btnIncrease);
    expect(mockAudioControls.increaseVolume).toHaveBeenCalledTimes(2);

    const btnDecrease = screen.getButton(/50% volume.+decrease.+volume/i);
    expect(mockAudioControls.decreaseVolume).not.toHaveBeenCalled();
    userEvent.click(btnDecrease);
    userEvent.click(btnDecrease);
    expect(mockAudioControls.decreaseVolume).toHaveBeenCalledTimes(2);
  });

  test('omitted when audio is muted', async () => {
    const { getAudioContext, render } = newTestContext();

    render(<AudioSettings onEnterAudioOnlyMode={vi.fn()} />);
    await screen.findByText(/volume:/i);

    act(() => getAudioContext()!.setIsEnabled(false));
    expect(screen.queryByText(/volume:/i)).not.toBeInTheDocument();
    expect(screen.queryButton(/increase.+volume/i)).not.toBeInTheDocument();
    expect(screen.queryButton(/decrease.+volume/i)).not.toBeInTheDocument();
  });
});

describe('rate controls', () => {
  test('renders current speech rate', async () => {
    const { getAudioContext, render } = newTestContext();

    render(<AudioSettings onEnterAudioOnlyMode={vi.fn()} />);
    await screen.findAllByText(/rate of speech:/i);

    screen.getButton(/rate.+100%.+increase.+rate/i);
    screen.getButton(/rate.+100%.+decrease.+rate/i);

    const ctx = assertDefined(getAudioContext());
    act(() => ctx.increasePlaybackRate());
    screen.getButton(/rate.+125%.+increase.+rate/i);
    screen.getButton(/rate.+125%.+decrease.+rate/i);
  });

  test('updates audio context', async () => {
    const { render } = newTestContext();

    render(<AudioSettings onEnterAudioOnlyMode={vi.fn()} />);
    await screen.findAllByText(/rate of speech:/i);

    const btnIncrease = screen.getButton(/rate.+100%.+increase.+rate/i);
    expect(mockAudioControls.increasePlaybackRate).not.toHaveBeenCalled();
    userEvent.click(btnIncrease);
    userEvent.click(btnIncrease);
    expect(mockAudioControls.increasePlaybackRate).toHaveBeenCalledTimes(2);

    const btnDecrease = screen.getButton(/rate.+100%.+decrease.+rate/i);
    expect(mockAudioControls.decreasePlaybackRate).not.toHaveBeenCalled();
    userEvent.click(btnDecrease);
    userEvent.click(btnDecrease);
    expect(mockAudioControls.decreasePlaybackRate).toHaveBeenCalledTimes(2);
  });

  test('omitted when audio is muted', async () => {
    const { getAudioContext, render } = newTestContext();

    render(<AudioSettings onEnterAudioOnlyMode={vi.fn()} />);
    await screen.findAllByText(/rate of speech:/i);

    act(() => getAudioContext()!.setIsEnabled(false));
    expect(screen.queryByText(/rate of speech:/i)).not.toBeInTheDocument();
    expect(screen.queryButton(/increase.+rate/i)).not.toBeInTheDocument();
    expect(screen.queryButton(/decrease.+rate/i)).not.toBeInTheDocument();
  });
});

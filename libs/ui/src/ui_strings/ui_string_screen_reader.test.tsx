import { beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { TestLanguageCode } from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';
import { act, screen, waitFor } from '../../test/react_testing_library';
import { newTestContext } from '../../test/test_context';
import { ClipParams, PlayAudioClips } from './play_audio_clips';
import { AppStringKey, appStrings } from './app_strings';
import { AudioOnly } from './audio_only';
import { LanguageOverride } from './language_override';
import { Button } from '../button';
import { AudioVolume } from './audio_volume';
import { PlaybackRate } from './audio_playback_rate';
import { useScreenReaderActive } from './ui_string_screen_reader';

vi.mock(import('./play_audio_clips.js'), async (importActual) => ({
  ...(await importActual()),
  PlayAudioClips: vi.fn(),
}));

const { CHINESE_SIMPLIFIED, ENGLISH, SPANISH } = TestLanguageCode;

function getMockClipOutput(clip: ClipParams) {
  return JSON.stringify(clip);
}

beforeAll(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
  });
});

let fireOnClipsDoneEvent: (() => void) | undefined;

beforeEach(() => {
  vi.mocked(PlayAudioClips).mockImplementation((props) => {
    const { clips, onDone } = props;

    fireOnClipsDoneEvent = onDone;

    return (
      <div data-testid="mockClips">
        {clips.map((clip) => (
          <span data-testid="mockClipOutput" key={clip.audioId}>
            {getMockClipOutput(clip)}
          </span>
        ))}
      </div>
    );
  });
});

test('queues up audio for <UiString>s within focus/click event targets', async () => {
  const { getAudioContext, mockApiClient, render } = newTestContext();

  mockApiClient.getUiStringAudioIds.mockImplementation((input) => {
    if (input.languageCode === ENGLISH) {
      return Promise.resolve({
        buttonDone: ['abc'],
        titleBmdReviewScreen: ['cba'],
      });
    }

    if (input.languageCode === SPANISH) {
      return Promise.resolve({
        instructionsBmdReviewPageNavigation: ['def', '123'],
      });
    }

    return Promise.resolve({});
  });

  render(
    <div>
      <div data-testid="clickTarget">
        <h1>{appStrings.titleBmdReviewScreen()}</h1>
        <AudioOnly>
          <LanguageOverride languageCode={SPANISH}>
            {appStrings.instructionsBmdReviewPageNavigation()}
          </LanguageOverride>
        </AudioOnly>
      </div>
      <Button data-testid="focusTarget" onPress={() => undefined}>
        {appStrings.buttonDone()}
      </Button>
      <AudioActiveHookClient />
    </div>
  );

  const clickTarget = await screen.findByTestId('clickTarget');
  act(() => getAudioContext()?.setIsEnabled(true));

  expectAudioActiveHookValue(false);

  // Should trigger audio on click events:
  act(() => userEvent.click(clickTarget));

  const mockClipOutputs = await screen.findAllByTestId('mockClipOutput');
  expect(mockClipOutputs).toHaveLength(3);
  expect(mockClipOutputs[0]).toHaveTextContent(
    getMockClipOutput({ audioId: 'cba', languageCode: ENGLISH })
  );
  expect(mockClipOutputs[1]).toHaveTextContent(
    getMockClipOutput({ audioId: 'def', languageCode: SPANISH })
  );
  expect(mockClipOutputs[2]).toHaveTextContent(
    getMockClipOutput({ audioId: '123', languageCode: SPANISH })
  );
  expectAudioActiveHookValue(true);

  // Should trigger audio on focus events:
  const focusTarget = screen.getByTestId('focusTarget');
  act(() => {
    focusTarget.dispatchEvent(new Event('focus', { bubbles: true }));
  });
  await waitFor(() =>
    expect(screen.queryAllByTestId('mockClipOutput')).toHaveLength(1)
  );
  expect(screen.getByTestId('mockClipOutput')).toHaveTextContent(
    getMockClipOutput({ audioId: 'abc', languageCode: ENGLISH })
  );
  expectAudioActiveHookValue(true);
});

test('resumes paused audio when user switches focus', async () => {
  const { getAudioContext, mockApiClient, render } = newTestContext();

  mockApiClient.getUiStringAudioIds.mockResolvedValue({
    titleBmdReviewScreen: ['abc'],
  });

  render(
    <div data-testid="clickTarget">{appStrings.titleBmdReviewScreen()}</div>
  );

  const clickTarget = await screen.findByTestId('clickTarget');

  act(() => getAudioContext()?.setIsEnabled(true));
  act(() => {
    vi.advanceTimersByTime(0);
  });
  await waitFor(() => {
    // wait for promises
  });

  act(() => getAudioContext()?.setIsPaused(true));
  expect(getAudioContext()?.isPaused).toEqual(true);

  act(() => userEvent.click(clickTarget));
  act(() => {
    vi.advanceTimersByTime(0);
  });
  await waitFor(() => {
    // wait for promises
  });

  expect(getAudioContext()?.isPaused).toEqual(false);
});

test('clears audio queue on blur', async () => {
  const { getAudioContext, mockApiClient, render } = newTestContext();

  mockApiClient.getUiStringAudioIds.mockResolvedValue({
    titleBmdReviewScreen: ['abc'],
  });

  render(
    <div>
      <div data-testid="clickTarget">{appStrings.titleBmdReviewScreen()}</div>
      <AudioActiveHookClient />
    </div>
  );

  const clickTarget = await screen.findByTestId('clickTarget');
  act(() => getAudioContext()?.setIsEnabled(true));
  act(() => userEvent.click(clickTarget));

  const mockClipOutput = await screen.findByTestId('mockClipOutput');
  expect(mockClipOutput).toHaveTextContent(
    getMockClipOutput({ audioId: 'abc', languageCode: ENGLISH })
  );
  expectAudioActiveHookValue(true);

  act(() => {
    clickTarget.dispatchEvent(new Event('blur', { bubbles: true }));
  });

  await waitFor(() =>
    expect(screen.queryByTestId('mockClipOutput')).not.toBeInTheDocument()
  );
  expectAudioActiveHookValue(false);
});

test('triggers replay when user language is changed', async () => {
  const { getAudioContext, getLanguageContext, mockApiClient, render } =
    newTestContext();

  mockApiClient.getUiStringAudioIds.mockImplementation((input) => {
    if (input.languageCode === CHINESE_SIMPLIFIED) {
      return Promise.resolve({
        titleBmdReviewScreen: ['abc'],
      });
    }

    if (input.languageCode === SPANISH) {
      return Promise.resolve({
        titleBmdReviewScreen: ['def'],
      });
    }

    return Promise.resolve({});
  });

  render(
    <div data-testid="clickTarget">{appStrings.titleBmdReviewScreen()}</div>
  );

  const clickTarget = await screen.findByTestId('clickTarget');
  act(() => {
    getAudioContext()?.setIsEnabled(true);
    getLanguageContext()?.setLanguage(CHINESE_SIMPLIFIED);
  });
  act(() => userEvent.click(clickTarget));

  const mockClipOutput = await screen.findByTestId('mockClipOutput');
  expect(mockClipOutput).toHaveTextContent(
    getMockClipOutput({ audioId: 'abc', languageCode: CHINESE_SIMPLIFIED })
  );

  act(() => getLanguageContext()?.setLanguage(SPANISH));

  const updatedMockClipOutput = await screen.findByTestId('mockClipOutput');
  expect(updatedMockClipOutput).toHaveTextContent(
    getMockClipOutput({ audioId: 'def', languageCode: SPANISH })
  );
});

test('is a no-op when audio is disabled', async () => {
  const { getAudioContext, mockApiClient, render } = newTestContext();

  mockApiClient.getUiStringAudioIds.mockResolvedValue({
    titleBmdReviewScreen: ['abc'],
  });

  render(
    <div>
      <div data-testid="clickTarget">{appStrings.titleBmdReviewScreen()}</div>
      <AudioActiveHookClient />
    </div>
  );

  const clickTarget = await screen.findByTestId('clickTarget');
  act(() => getAudioContext()?.setIsEnabled(false));
  act(() => userEvent.click(clickTarget));
  act(() => {
    vi.advanceTimersByTime(0);
  });
  await waitFor(() => {
    // wait for promises
  });

  expect(screen.queryByTestId('mockClips')).not.toBeInTheDocument();
  expectAudioActiveHookValue(false);
});

test('handles missing audio ID data', async () => {
  const { getAudioContext, mockApiClient, render } = newTestContext();

  mockApiClient.getUiStringAudioIds.mockResolvedValue({});

  render(
    <div data-testid="clickTarget">{appStrings.titleBmdReviewScreen()}</div>
  );

  const clickTarget = await screen.findByTestId('clickTarget');
  act(() => getAudioContext()?.setIsEnabled(true));
  act(() => userEvent.click(clickTarget));
  act(() => {
    vi.advanceTimersByTime(0);
  });
  await waitFor(() => {
    // wait for promises
  });

  expect(screen.queryByTestId('mockClipOutput')).not.toBeInTheDocument();
  screen.getByTestId('clickTarget');
});

test('volume control API', async () => {
  const { getAudioContext, getAudioControls, mockApiClient, render } =
    newTestContext();

  const mockAudioIds: Partial<Record<AppStringKey, string[]>> = {
    audioFeedbackVolumeMinimum: ['min-volume'],
    audioFeedbackVolume10Percent: ['10%-volume'],
    audioFeedbackVolume90Percent: ['90%-volume'],
    audioFeedbackVolumeMaximum: ['max-volume'],
    titleBmdReviewScreen: ['screen-title'],
  };
  mockApiClient.getUiStringAudioIds.mockResolvedValue(mockAudioIds);

  render(
    <div data-testid="clickTarget">{appStrings.titleBmdReviewScreen()}</div>
  );

  const clickTarget = await screen.findByTestId('clickTarget');
  act(() => getAudioContext()?.setIsEnabled(true));
  act(() => userEvent.click(clickTarget));
  act(() => {
    vi.advanceTimersByTime(0);
  });
  await waitFor(() => {
    // wait for promises
  });

  expect(await screen.findByTestId('mockClipOutput')).toHaveTextContent(
    getMockClipOutput({ audioId: 'screen-title', languageCode: ENGLISH })
  );

  // Simulate increasing the volume to the maximum:
  await waitFor(() => {
    act(() => getAudioControls()?.increaseVolume());
    expect(getAudioContext()?.volume).toEqual(AudioVolume.MAXIMUM);
  });

  // Expect no volume-change feedback while the screen reader audio is still
  // active:
  expect(screen.getByTestId('mockClipOutput')).toHaveTextContent(
    getMockClipOutput({ audioId: 'screen-title', languageCode: ENGLISH })
  );

  // Simulate screen reader audio ending:
  act(() => fireOnClipsDoneEvent?.());
  expect(screen.queryByTestId('mockClipOutput')).not.toBeInTheDocument();

  // Simulate increasing the volume again:
  act(() => getAudioControls()?.increaseVolume());
  expect(getAudioContext()?.volume).toEqual(AudioVolume.MAXIMUM);
  expect(await screen.findByTestId('mockClipOutput')).toHaveTextContent(
    getMockClipOutput({ audioId: 'max-volume', languageCode: ENGLISH })
  );

  // Simulate cycling volume level (for single-button volume-control devices):
  act(() => getAudioControls()?.cycleVolume());
  expect(getAudioContext()?.volume).toEqual(AudioVolume.MINIMUM);
  expect(await screen.findByTestId('mockClipOutput')).toHaveTextContent(
    getMockClipOutput({ audioId: 'min-volume', languageCode: ENGLISH })
  );
  act(() => getAudioControls()?.cycleVolume());
  expect(getAudioContext()?.volume).toEqual(AudioVolume.TEN_PERCENT);
  expect(await screen.findByTestId('mockClipOutput')).toHaveTextContent(
    getMockClipOutput({ audioId: '10%-volume', languageCode: ENGLISH })
  );

  // Decreasing volume while no screen reader audio is active should play
  // appropriate feedback:
  act(() => getAudioControls()?.decreaseVolume());
  expect(getAudioContext()?.volume).toEqual(AudioVolume.MINIMUM);
  expect(await screen.findByTestId('mockClipOutput')).toHaveTextContent(
    getMockClipOutput({ audioId: 'min-volume', languageCode: ENGLISH })
  );

  // Simulate screen reader audio ending:
  act(() => fireOnClipsDoneEvent?.());
  expect(screen.queryByTestId('mockClipOutput')).not.toBeInTheDocument();
});

test('playback rate control API', async () => {
  const { getAudioContext, getAudioControls, mockApiClient, render } =
    newTestContext();

  const mockAudioIds: Partial<Record<AppStringKey, string[]>> = {
    audioFeedbackRateMinimum: ['min-rate'],
    audioFeedbackRate75Percent: ['75%-rate'],
    audioFeedbackRate100Percent: ['100%-rate'],
    audioFeedbackRateMaximum: ['max-rate'],
    titleBmdReviewScreen: ['screen-title'],
  };
  mockApiClient.getUiStringAudioIds.mockResolvedValue(mockAudioIds);

  render(
    <div data-testid="clickTarget">{appStrings.titleBmdReviewScreen()}</div>
  );

  const clickTarget = await screen.findByTestId('clickTarget');
  act(() => getAudioContext()?.setIsEnabled(true));
  act(() => userEvent.click(clickTarget));
  act(() => {
    vi.advanceTimersByTime(0);
  });
  await waitFor(() => {
    // wait for promises
  });

  expect(await screen.findByTestId('mockClipOutput')).toHaveTextContent(
    getMockClipOutput({ audioId: 'screen-title', languageCode: ENGLISH })
  );

  // Simulate decreasing the rate while screen reader audio is still active.
  // No rate-change feedback should interrupt the active audio:
  act(() => getAudioControls()?.decreasePlaybackRate());
  expect(getAudioContext()?.playbackRate).toEqual(PlaybackRate.PERCENT_75);
  expect(screen.getByTestId('mockClipOutput')).toHaveTextContent(
    getMockClipOutput({ audioId: 'screen-title', languageCode: ENGLISH })
  );

  // Simulate screen reader audio ending:
  act(() => fireOnClipsDoneEvent?.());
  expect(screen.queryByTestId('mockClipOutput')).not.toBeInTheDocument();

  // Decreasing rate while no screen reader audio is active should play
  // appropriate feedback:
  act(() => getAudioControls()?.decreasePlaybackRate());
  expect(getAudioContext()?.playbackRate).toEqual(PlaybackRate.MINIMUM);
  expect(await screen.findByTestId('mockClipOutput')).toHaveTextContent(
    getMockClipOutput({ audioId: 'min-rate', languageCode: ENGLISH })
  );

  // Simulate screen reader audio ending:
  act(() => fireOnClipsDoneEvent?.());
  expect(screen.queryByTestId('mockClipOutput')).not.toBeInTheDocument();

  // Increasing rate should play appropriate feedback:
  act(() => getAudioControls()?.increasePlaybackRate());
  expect(getAudioContext()?.playbackRate).toEqual(PlaybackRate.PERCENT_75);
  expect(await screen.findByTestId('mockClipOutput')).toHaveTextContent(
    getMockClipOutput({ audioId: '75%-rate', languageCode: ENGLISH })
  );

  // Simulate screen reader audio ending:
  act(() => fireOnClipsDoneEvent?.());
  expect(screen.queryByTestId('mockClipOutput')).not.toBeInTheDocument();

  // Increasing to maximum:
  await waitFor(() => {
    act(() => getAudioControls()?.increasePlaybackRate());
    expect(getAudioContext()?.playbackRate).toEqual(PlaybackRate.MAXIMUM);
  });
  expect(await screen.findByTestId('mockClipOutput')).toHaveTextContent(
    getMockClipOutput({ audioId: 'max-rate', languageCode: ENGLISH })
  );

  // Simulate screen reader audio ending:
  act(() => fireOnClipsDoneEvent?.());
  expect(screen.queryByTestId('mockClipOutput')).not.toBeInTheDocument();
});

type AudioStatus = 'active' | 'inactive';
const AUDIO_STATUS_TEST_ID = 'AudioActiveHookClient';

function expectAudioActiveHookValue(active: boolean) {
  const current = screen.getByTestId(AUDIO_STATUS_TEST_ID).textContent;
  expect(current).toEqual<AudioStatus>(active ? 'active' : 'inactive');
}

function AudioActiveHookClient(): JSX.Element {
  const audioActive = useScreenReaderActive();
  const status: AudioStatus = audioActive ? 'active' : 'inactive';

  return <div data-testid={AUDIO_STATUS_TEST_ID}>{status}</div>;
}

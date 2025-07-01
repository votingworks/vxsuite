import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';
import React, { act } from 'react';
import {
  DEFAULT_AUDIO_ENABLED_STATE,
  UiStringsAudioContextProvider,
  useAudioContext,
} from './audio_context';
import { createUiStringsApi } from '../hooks/ui_strings_api';
import { renderHook } from '../../test/react_testing_library';
import {
  AudioVolume,
  DEFAULT_AUDIO_VOLUME,
  getAudioGainRatio,
} from './audio_volume';
import {
  DEFAULT_PLAYBACK_RATE,
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
  PLAYBACK_RATE_INCREMENT_AMOUNT,
} from './audio_playback_rate';
import { newTestContext } from '../../test/test_context';

let setMockHeadphonesPluggedIn: (isPluggedIn: boolean) => void;

vi.mock(
  import('../hooks/use_headphones_plugged_in.js'),
  async (importActual) => ({
    ...(await importActual()),
    useHeadphonesPluggedIn() {
      const [isPluggedIn, setIsPluggedIn] = React.useState(true);

      setMockHeadphonesPluggedIn = setIsPluggedIn;

      return isPluggedIn;
    },
  })
);

const { mockApiClient } = newTestContext();
const mockUiStringsApi = createUiStringsApi(() => mockApiClient);

function TestContextWrapper(props: { children: React.ReactNode }) {
  const { children } = props;

  return (
    <UiStringsAudioContextProvider api={mockUiStringsApi}>
      {children}
    </UiStringsAudioContextProvider>
  );
}

const mockWebAudioContext = {
  createGain: vi.fn(),
  resume: vi.fn(),
  suspend: vi.fn(),
  destination: {
    disconnect: vi.fn(),
  },
} as const;

const mockGainNode = { gain: { value: 9000 } } as unknown as GainNode;

beforeEach(() => {
  const mockAudioContextConstructor = vi.fn();
  mockAudioContextConstructor.mockReturnValue(mockWebAudioContext);
  mockWebAudioContext.createGain.mockReturnValue(mockGainNode);

  window.AudioContext = mockAudioContextConstructor;
});

const originalWebAudioContext = window.AudioContext;

afterAll(() => {
  window.AudioContext = originalWebAudioContext;
});

test('exposes UiStrings API', () => {
  const { result } = renderHook(useAudioContext, {
    wrapper: TestContextWrapper,
  });

  expect(result.current?.api).toEqual(mockUiStringsApi);
});

test('exposes web AudioContext', () => {
  const { result } = renderHook(useAudioContext, {
    wrapper: TestContextWrapper,
  });

  expect(result.current?.webAudioContext).toEqual(mockWebAudioContext);
});

test('setVolume', () => {
  const { result } = renderHook(useAudioContext, {
    wrapper: TestContextWrapper,
  });

  expect(result.current?.volume).toEqual(DEFAULT_AUDIO_VOLUME);
  expect(mockGainNode.gain.value).toEqual(
    getAudioGainRatio(DEFAULT_AUDIO_VOLUME)
  );

  act(() => result.current?.setVolume(AudioVolume.MAXIMUM));
  expect(result.current?.volume).toEqual(AudioVolume.MAXIMUM);
  expect(mockGainNode.gain.value).toEqual(
    getAudioGainRatio(AudioVolume.MAXIMUM)
  );

  act(() => result.current?.setVolume(AudioVolume.TWENTY_PERCENT));
  expect(result.current?.volume).toEqual(AudioVolume.TWENTY_PERCENT);
  expect(mockGainNode.gain.value).toEqual(
    getAudioGainRatio(AudioVolume.TWENTY_PERCENT)
  );
});

describe('playback rate API', () => {
  test('increasePlaybackRate', () => {
    const { result } = renderHook(useAudioContext, {
      wrapper: TestContextWrapper,
    });

    expect(result.current?.playbackRate).toEqual(DEFAULT_PLAYBACK_RATE);

    act(() => result.current?.increasePlaybackRate());
    act(() => result.current?.increasePlaybackRate());
    expect(result.current?.playbackRate).toEqual(
      DEFAULT_PLAYBACK_RATE + PLAYBACK_RATE_INCREMENT_AMOUNT * 2
    );

    // Try increasing the rate well past the maximum:
    const maxIncrementSteps = Math.ceil(
      MAX_PLAYBACK_RATE / PLAYBACK_RATE_INCREMENT_AMOUNT
    );
    for (let i = 0; i < maxIncrementSteps + 2; i += 1) {
      act(() => result.current?.increasePlaybackRate());
    }
    expect(result.current?.playbackRate).toEqual(MAX_PLAYBACK_RATE);
  });

  test('decreasePlaybackRate', () => {
    const { result } = renderHook(useAudioContext, {
      wrapper: TestContextWrapper,
    });

    expect(result.current?.playbackRate).toEqual(DEFAULT_PLAYBACK_RATE);

    act(() => result.current?.decreasePlaybackRate());
    act(() => result.current?.decreasePlaybackRate());
    expect(result.current?.playbackRate).toEqual(
      DEFAULT_PLAYBACK_RATE - PLAYBACK_RATE_INCREMENT_AMOUNT * 2
    );

    // Try decreasing the rate well past the minimum:
    const maxDecrementSteps = Math.abs(
      Math.ceil(MIN_PLAYBACK_RATE / PLAYBACK_RATE_INCREMENT_AMOUNT)
    );
    for (let i = 0; i < maxDecrementSteps + 2; i += 1) {
      act(() => result.current?.decreasePlaybackRate());
    }
    expect(result.current?.playbackRate).toEqual(MIN_PLAYBACK_RATE);
  });
});

test('setIsEnabled', () => {
  const { result } = renderHook(useAudioContext, {
    wrapper: TestContextWrapper,
  });

  expect(result.current?.isEnabled).toEqual(DEFAULT_AUDIO_ENABLED_STATE);

  act(() => result.current?.setIsEnabled(!DEFAULT_AUDIO_ENABLED_STATE));
  expect(result.current?.isEnabled).toEqual(!DEFAULT_AUDIO_ENABLED_STATE);
  expect(result.current?.isPaused).toEqual(!result.current?.isEnabled);

  act(() => result.current?.setIsEnabled(DEFAULT_AUDIO_ENABLED_STATE));
  expect(result.current?.isEnabled).toEqual(DEFAULT_AUDIO_ENABLED_STATE);
  expect(result.current?.isPaused).toEqual(!result.current?.isEnabled);

  // Re-enabling should persist all playback settings:

  act(() => result.current?.setIsEnabled(false));
  act(() => result.current?.increasePlaybackRate());
  act(() => result.current?.setVolume(AudioVolume.MINIMUM));

  expect(result.current?.isPaused).toEqual(true);

  act(() => result.current?.setIsEnabled(true));

  expect(result.current?.isEnabled).toEqual(true);
  expect(result.current?.isPaused).toEqual(false);
  expect(result.current?.volume).toEqual(AudioVolume.MINIMUM);
  expect(result.current?.playbackRate).not.toEqual(DEFAULT_PLAYBACK_RATE);
});

test('toggleEnabled', () => {
  const { result } = renderHook(useAudioContext, {
    wrapper: TestContextWrapper,
  });

  act(() => result.current?.toggleEnabled());
  expect(result.current?.isEnabled).toEqual(!DEFAULT_AUDIO_ENABLED_STATE);

  act(() => result.current?.toggleEnabled());
  expect(result.current?.isEnabled).toEqual(DEFAULT_AUDIO_ENABLED_STATE);
});

test('setIsPaused', () => {
  const { result } = renderHook(useAudioContext, {
    wrapper: TestContextWrapper,
  });

  act(() => result.current?.setIsEnabled(true));

  vi.resetAllMocks();

  // Changing from `false` to `true` should suspend the web audio context:
  act(() => result.current?.setIsPaused(true));
  expect(mockWebAudioContext.suspend).toHaveBeenCalled();
  expect(mockWebAudioContext.resume).not.toHaveBeenCalled();
  expect(mockWebAudioContext.destination.disconnect).not.toHaveBeenCalled();

  vi.resetAllMocks();

  // Changing from `true` to `true` should be a no-op:
  act(() => result.current?.setIsPaused(true));
  expect(mockWebAudioContext.resume).not.toHaveBeenCalled();
  expect(mockWebAudioContext.suspend).not.toHaveBeenCalled();
  expect(mockWebAudioContext.destination.disconnect).not.toHaveBeenCalled();

  // Changing from `true` to `false` should resume the web audio context:
  act(() => result.current?.setIsPaused(false));
  expect(mockWebAudioContext.resume).toHaveBeenCalled();
  expect(mockWebAudioContext.suspend).not.toHaveBeenCalled();
  expect(mockWebAudioContext.destination.disconnect).not.toHaveBeenCalled();
});

test('togglePause', () => {
  const { result } = renderHook(useAudioContext, {
    wrapper: TestContextWrapper,
  });

  act(() => result.current?.setIsEnabled(true));

  vi.resetAllMocks();

  act(() => result.current?.togglePause());

  expect(mockWebAudioContext.suspend).toHaveBeenCalled();
  expect(mockWebAudioContext.resume).not.toHaveBeenCalled();
  expect(mockWebAudioContext.destination.disconnect).not.toHaveBeenCalled();

  vi.resetAllMocks();

  act(() => result.current?.togglePause());

  expect(mockWebAudioContext.resume).toHaveBeenCalled();
  expect(mockWebAudioContext.suspend).not.toHaveBeenCalled();
  expect(mockWebAudioContext.destination.disconnect).not.toHaveBeenCalled();
});

test('reset', () => {
  const { result } = renderHook(useAudioContext, {
    wrapper: TestContextWrapper,
  });

  act(() => result.current?.setIsEnabled(true));
  act(() => result.current?.increasePlaybackRate());
  act(() => result.current?.setVolume(AudioVolume.MINIMUM));
  act(() => result.current?.setIsPaused(false));

  act(() => result.current?.reset());

  expect(result.current?.isEnabled).toEqual(DEFAULT_AUDIO_ENABLED_STATE);
  expect(result.current?.volume).toEqual(DEFAULT_AUDIO_VOLUME);
  expect(result.current?.playbackRate).toEqual(DEFAULT_PLAYBACK_RATE);
  expect(result.current?.isPaused).toEqual(false);
});

test('setControlsEnabled', () => {
  const { result } = renderHook(useAudioContext, {
    wrapper: TestContextWrapper,
  });

  act(() => result.current?.setControlsEnabled(false));

  //
  // These should all be no-ops when controls are disabled:
  //

  act(() => result.current?.setIsEnabled(true));
  expect(result.current?.isEnabled).toEqual(DEFAULT_AUDIO_ENABLED_STATE);

  act(() => result.current?.increasePlaybackRate());
  expect(result.current?.playbackRate).toEqual(DEFAULT_PLAYBACK_RATE);

  act(() => result.current?.decreasePlaybackRate());
  expect(result.current?.playbackRate).toEqual(DEFAULT_PLAYBACK_RATE);

  act(() => result.current?.setVolume(AudioVolume.MINIMUM));
  expect(result.current?.volume).toEqual(DEFAULT_AUDIO_VOLUME);

  act(() => result.current?.setIsPaused(true));
  expect(result.current?.isPaused).toEqual(false);
});

test('disables audio when headphones are unplugged', () => {
  const { result } = renderHook(useAudioContext, {
    wrapper: TestContextWrapper,
  });

  act(() => setMockHeadphonesPluggedIn(true));
  act(() => result.current?.setIsEnabled(true));
  expect(result.current?.isEnabled).toEqual(true);

  act(() => setMockHeadphonesPluggedIn(false));
  expect(result.current?.isEnabled).toEqual(false);

  // `setIsEnabled()` should be a no-op:
  act(() => result.current?.setIsEnabled(true));
  expect(result.current?.isEnabled).toEqual(false);

  // `reset()` should be a no-op for the enabled state:
  act(() => result.current?.reset());
  expect(result.current?.isEnabled).toEqual(false);

  // Should get re-enabled when headphones are plugged in:
  act(() => setMockHeadphonesPluggedIn(true));
  expect(result.current?.isEnabled).toEqual(true);
});

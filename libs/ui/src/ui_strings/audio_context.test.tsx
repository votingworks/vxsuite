import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';
import React, { act } from 'react';
import { mockConstructor } from '@votingworks/test-utils';
import {
  DEFAULT_AUDIO_ENABLED_STATE,
  UiStringsAudioContextProvider,
  useAudioContext,
} from './audio_context.js';
import { createUiStringsApi } from '../hooks/ui_strings_api.js';
import { renderHook } from '../../test/react_testing_library.js';
import {
  AudioVolume,
  DEFAULT_AUDIO_VOLUME,
  getAudioGainRatio,
} from './audio_volume.js';
import {
  DEFAULT_PLAYBACK_RATE,
  PLAYBACK_RATES,
  PlaybackRate,
} from './audio_playback_rate.js';
import { newTestContext } from '../../test/test_context.js';

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
  const mockAudioContextConstructor = vi.fn(
    mockConstructor(() => mockWebAudioContext)
  );
  mockWebAudioContext.createGain.mockReturnValue(mockGainNode);

  window.AudioContext =
    mockAudioContextConstructor as unknown as typeof AudioContext;
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
  const DEFAULT_RATE_IDX = PLAYBACK_RATES.indexOf(DEFAULT_PLAYBACK_RATE);

  test('increasePlaybackRate', () => {
    const { result } = renderHook(useAudioContext, {
      wrapper: TestContextWrapper,
    });

    for (let i = DEFAULT_RATE_IDX; i < PLAYBACK_RATES.length; i += 1) {
      expect(result.current?.playbackRate).toEqual(PLAYBACK_RATES[i]);
      act(() => result.current?.increasePlaybackRate());
    }

    // Try increasing the rate well past the maximum:
    expect(result.current?.playbackRate).toEqual(PlaybackRate.MAXIMUM);
    act(() => result.current?.increasePlaybackRate());
    act(() => result.current?.increasePlaybackRate());
    expect(result.current?.playbackRate).toEqual(PlaybackRate.MAXIMUM);
  });

  test('decreasePlaybackRate', () => {
    const { result } = renderHook(useAudioContext, {
      wrapper: TestContextWrapper,
    });

    for (let i = DEFAULT_RATE_IDX; i >= 0; i -= 1) {
      expect(result.current?.playbackRate).toEqual(PLAYBACK_RATES[i]);
      act(() => result.current?.decreasePlaybackRate());
    }

    // Try decreasing the rate well past the minimum:
    expect(result.current?.playbackRate).toEqual(PlaybackRate.MINIMUM);
    act(() => result.current?.decreasePlaybackRate());
    act(() => result.current?.decreasePlaybackRate());
    expect(result.current?.playbackRate).toEqual(PlaybackRate.MINIMUM);
  });
});

test('setIsEnabled', () => {
  const { result } = renderHook(useAudioContext, {
    wrapper: TestContextWrapper,
  });

  expect(result.current?.isEnabledByUser).toEqual(DEFAULT_AUDIO_ENABLED_STATE);

  act(() => result.current?.setIsEnabled(!DEFAULT_AUDIO_ENABLED_STATE));
  expect(result.current?.isEnabledByUser).toEqual(!DEFAULT_AUDIO_ENABLED_STATE);
  expect(result.current?.isPaused).toEqual(!result.current?.isEnabledByUser);

  act(() => result.current?.setIsEnabled(DEFAULT_AUDIO_ENABLED_STATE));
  expect(result.current?.isEnabledByUser).toEqual(DEFAULT_AUDIO_ENABLED_STATE);
  expect(result.current?.isPaused).toEqual(!result.current?.isEnabledByUser);

  // Re-enabling should persist all playback settings:

  act(() => result.current?.setIsEnabled(false));
  act(() => result.current?.increasePlaybackRate());
  act(() => result.current?.setVolume(AudioVolume.MINIMUM));

  expect(result.current?.isPaused).toEqual(true);

  act(() => result.current?.setIsEnabled(true));

  expect(result.current?.isEnabledByUser).toEqual(true);
  expect(result.current?.isPaused).toEqual(false);
  expect(result.current?.volume).toEqual(AudioVolume.MINIMUM);
  expect(result.current?.playbackRate).not.toEqual(DEFAULT_PLAYBACK_RATE);
});

test('toggleEnabled', () => {
  const { result } = renderHook(useAudioContext, {
    wrapper: TestContextWrapper,
  });

  act(() => result.current?.toggleEnabled());
  expect(result.current?.isEnabledByUser).toEqual(!DEFAULT_AUDIO_ENABLED_STATE);

  act(() => result.current?.toggleEnabled());
  expect(result.current?.isEnabledByUser).toEqual(DEFAULT_AUDIO_ENABLED_STATE);
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

  expect(result.current?.isEnabledByUser).toEqual(DEFAULT_AUDIO_ENABLED_STATE);
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
  expect(result.current?.isEnabledByUser).toEqual(DEFAULT_AUDIO_ENABLED_STATE);

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
  expect(result.current?.isEnabledByUser).toEqual(true);

  act(() => setMockHeadphonesPluggedIn(false));
  expect(result.current?.isEnabledByUser).toEqual(false);

  // `setIsEnabled()` should be a no-op:
  act(() => result.current?.setIsEnabled(true));
  expect(result.current?.isEnabledByUser).toEqual(false);

  // `reset()` should be a no-op for the enabled state:
  act(() => result.current?.reset());
  expect(result.current?.isEnabledByUser).toEqual(false);

  // Should get re-enabled when headphones are plugged in:
  act(() => setMockHeadphonesPluggedIn(true));
  expect(result.current?.isEnabledByUser).toEqual(true);
});

test('setIsMutedBySystem suspends playback without changing the setting', () => {
  const { result } = renderHook(useAudioContext, {
    wrapper: TestContextWrapper,
  });

  act(() => result.current?.setIsEnabled(true));
  expect(result.current?.isPlaybackActive).toEqual(true);

  vi.resetAllMocks();

  act(() => result.current?.setIsMutedBySystem(true));
  expect(result.current?.isMutedBySystem).toEqual(true);
  expect(result.current?.isEnabledByUser).toEqual(true);
  expect(result.current?.isPlaybackActive).toEqual(false);
  expect(result.current?.isPaused).toEqual(true);
  expect(mockWebAudioContext.suspend).toHaveBeenCalled();

  vi.resetAllMocks();

  act(() => result.current?.setIsMutedBySystem(false));
  expect(result.current?.isMutedBySystem).toEqual(false);
  expect(result.current?.isPlaybackActive).toEqual(true);
  expect(result.current?.isPaused).toEqual(false);
  expect(mockWebAudioContext.resume).toHaveBeenCalled();
});

test('unmuting keeps playback off when the setting is off', () => {
  const { result } = renderHook(useAudioContext, {
    wrapper: TestContextWrapper,
  });

  act(() => result.current?.setIsMutedBySystem(true));
  act(() => result.current?.setIsEnabled(false));
  act(() => result.current?.setIsMutedBySystem(false));

  expect(result.current?.isEnabledByUser).toEqual(false);
  expect(result.current?.isPlaybackActive).toEqual(false);
  expect(result.current?.isPaused).toEqual(true);
});

test('setting changes while muted take effect on unmute', () => {
  const { result } = renderHook(useAudioContext, {
    wrapper: TestContextWrapper,
  });

  act(() => result.current?.setIsEnabled(false));
  act(() => result.current?.setIsMutedBySystem(true));
  act(() => result.current?.setIsEnabled(true));

  expect(result.current?.isEnabledByUser).toEqual(true);
  expect(result.current?.isPlaybackActive).toEqual(false);

  act(() => result.current?.setIsMutedBySystem(false));
  expect(result.current?.isPlaybackActive).toEqual(true);
});

test('setIsMutedBySystem works when controls are disabled', () => {
  const { result } = renderHook(useAudioContext, {
    wrapper: TestContextWrapper,
  });

  act(() => result.current?.setControlsEnabled(false));
  act(() => result.current?.setIsMutedBySystem(true));
  expect(result.current?.isMutedBySystem).toEqual(true);
  expect(result.current?.isPlaybackActive).toEqual(false);

  act(() => result.current?.setIsMutedBySystem(false));
  expect(result.current?.isMutedBySystem).toEqual(false);
});

test('reset does not clear the mute', () => {
  const { result } = renderHook(useAudioContext, {
    wrapper: TestContextWrapper,
  });

  act(() => result.current?.setIsMutedBySystem(true));
  act(() => result.current?.reset());

  expect(result.current?.isMutedBySystem).toEqual(true);
  expect(result.current?.isPlaybackActive).toEqual(false);
});

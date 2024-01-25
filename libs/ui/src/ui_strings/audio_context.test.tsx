import React from 'react';
import { act } from 'react-dom/test-utils';
import {
  UiStringsAudioContextProvider,
  useAudioContext,
} from './audio_context';
import {
  UiStringsReactQueryApi,
  createUiStringsApi,
} from '../hooks/ui_strings_api';
import { renderHook } from '../../test/react_testing_library';
import {
  DEFAULT_GAIN_DB,
  GAIN_INCREMENT_AMOUNT_DB,
  MAX_GAIN_DB,
  MIN_GAIN_DB,
} from './audio_volume';
import {
  DEFAULT_PLAYBACK_RATE,
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
  PLAYBACK_RATE_INCREMENT_AMOUNT,
} from './audio_playback_rate';

const mockUiStringsApi: UiStringsReactQueryApi = createUiStringsApi(() => ({
  getAudioClips: jest.fn(),
  getAvailableLanguages: jest.fn(),
  getUiStringAudioIds: jest.fn(),
  getUiStrings: jest.fn(),
}));

function TestContextWrapper(props: { children: React.ReactNode }) {
  const { children } = props;

  return (
    <UiStringsAudioContextProvider api={mockUiStringsApi}>
      {children}
    </UiStringsAudioContextProvider>
  );
}

const mockWebAudioContext = {
  resume: jest.fn(),
  suspend: jest.fn(),
  destination: {
    disconnect: jest.fn(),
  },
} as const;

beforeEach(() => {
  const mockAudioContextConstructor = jest.fn();
  mockAudioContextConstructor.mockReturnValue(mockWebAudioContext);

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

describe('volume API', () => {
  test('increaseVolume', () => {
    const { result } = renderHook(useAudioContext, {
      wrapper: TestContextWrapper,
    });

    expect(result.current?.gainDb).toEqual(DEFAULT_GAIN_DB);

    act(() => result.current?.increaseVolume());
    act(() => result.current?.increaseVolume());
    expect(result.current?.gainDb).toEqual(
      DEFAULT_GAIN_DB + GAIN_INCREMENT_AMOUNT_DB * 2
    );

    // Try increasing the volume well past the maximum:
    const maxIncrementSteps = Math.ceil(MAX_GAIN_DB / GAIN_INCREMENT_AMOUNT_DB);
    for (let i = 0; i < maxIncrementSteps + 2; i += 1) {
      act(() => result.current?.increaseVolume());
    }
    expect(result.current?.gainDb).toEqual(MAX_GAIN_DB);
  });

  test('decreaseVolume', () => {
    const { result } = renderHook(useAudioContext, {
      wrapper: TestContextWrapper,
    });

    expect(result.current?.gainDb).toEqual(DEFAULT_GAIN_DB);

    act(() => result.current?.decreaseVolume());
    act(() => result.current?.decreaseVolume());
    expect(result.current?.gainDb).toEqual(
      DEFAULT_GAIN_DB - GAIN_INCREMENT_AMOUNT_DB * 2
    );

    // Try decreasing the volume well past the minimum:
    const maxDecrementSteps = Math.abs(
      Math.ceil(MIN_GAIN_DB / GAIN_INCREMENT_AMOUNT_DB)
    );
    for (let i = 0; i < maxDecrementSteps + 2; i += 1) {
      act(() => result.current?.decreaseVolume());
    }
    expect(result.current?.gainDb).toEqual(MIN_GAIN_DB);
  });
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

  expect(result.current?.isEnabled).toEqual(false);

  jest.resetAllMocks();

  act(() => result.current?.setIsEnabled(true));

  expect(result.current?.isEnabled).toEqual(true);
  expect(mockWebAudioContext.resume).toHaveBeenCalled();
  expect(mockWebAudioContext.suspend).not.toHaveBeenCalled();
  expect(mockWebAudioContext.destination.disconnect).not.toHaveBeenCalled();

  jest.resetAllMocks();

  act(() => result.current?.setIsEnabled(false));

  expect(result.current?.isEnabled).toEqual(false);
  expect(mockWebAudioContext.suspend).toHaveBeenCalled();
  expect(mockWebAudioContext.resume).not.toHaveBeenCalled();
  expect(mockWebAudioContext.destination.disconnect).toHaveBeenCalled();

  jest.resetAllMocks();

  // Re-enabling should reset all settings:

  act(() => result.current?.increasePlaybackRate());
  act(() => result.current?.decreaseVolume());

  act(() => result.current?.setIsEnabled(true));

  expect(result.current?.isEnabled).toEqual(true);
  expect(result.current?.gainDb).toEqual(DEFAULT_GAIN_DB);
  expect(result.current?.playbackRate).toEqual(DEFAULT_PLAYBACK_RATE);
});

test('toggleEnabled', () => {
  const { result } = renderHook(useAudioContext, {
    wrapper: TestContextWrapper,
  });

  act(() => result.current?.toggleEnabled());
  expect(result.current?.isEnabled).toEqual(true);

  act(() => result.current?.toggleEnabled());
  expect(result.current?.isEnabled).toEqual(false);
});

test('setIsPaused', () => {
  const { result } = renderHook(useAudioContext, {
    wrapper: TestContextWrapper,
  });

  act(() => result.current?.setIsEnabled(true));

  jest.resetAllMocks();

  // Changing from `false` to `true` should suspend the web audio context:
  act(() => result.current?.setIsPaused(true));
  expect(mockWebAudioContext.suspend).toHaveBeenCalled();
  expect(mockWebAudioContext.resume).not.toHaveBeenCalled();
  expect(mockWebAudioContext.destination.disconnect).not.toHaveBeenCalled();

  jest.resetAllMocks();

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

  jest.resetAllMocks();

  act(() => result.current?.togglePause());

  expect(mockWebAudioContext.suspend).toHaveBeenCalled();
  expect(mockWebAudioContext.resume).not.toHaveBeenCalled();
  expect(mockWebAudioContext.destination.disconnect).not.toHaveBeenCalled();

  jest.resetAllMocks();

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
  act(() => result.current?.decreaseVolume());
  act(() => result.current?.togglePause());

  jest.resetAllMocks();

  act(() => result.current?.reset());

  expect(result.current?.gainDb).toEqual(DEFAULT_GAIN_DB);
  expect(result.current?.playbackRate).toEqual(DEFAULT_PLAYBACK_RATE);
  expect(mockWebAudioContext.resume).toHaveBeenCalled();
  expect(mockWebAudioContext.suspend).not.toHaveBeenCalled();
  expect(mockWebAudioContext.destination.disconnect).not.toHaveBeenCalled();
});

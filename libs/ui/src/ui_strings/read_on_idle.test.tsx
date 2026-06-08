import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import React, { act } from 'react';
import { ReadOnIdle } from './read_on_idle';
import { render, screen } from '../../test/react_testing_library';
import { UiStringsAudioContext } from './audio_context';
import { UiStringScreenReaderContext } from './ui_string_screen_reader';
import {
  UiStringsReactQueryApi,
  createUiStringsApi,
} from '../hooks/ui_strings_api';
import { DEFAULT_AUDIO_VOLUME } from './audio_volume';
import { PlaybackRate } from './audio_playback_rate';
import { newTestContext } from '../../test/test_context';

const DELAY_MS = 5_000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function newRenderer(params: {
  isAudioEnabled?: boolean;
  isScreenReaderActive?: boolean;
}) {
  const mockOnClick = vi.fn();
  const { mockApiClient } = newTestContext();
  const mockUiStringsApi: UiStringsReactQueryApi = createUiStringsApi(
    () => mockApiClient
  );

  function TestContextWrapper(props: {
    children: React.ReactNode;
    isAudioEnabled: boolean;
    isScreenReaderActive: boolean;
  }) {
    const { children, isAudioEnabled, isScreenReaderActive } = props;

    return (
      <UiStringsAudioContext.Provider
        value={{
          api: mockUiStringsApi,
          decreasePlaybackRate: vi.fn(),
          increasePlaybackRate: vi.fn(),
          isEnabled: isAudioEnabled,
          isPaused: false,
          playbackRate: PlaybackRate.PERCENT_100,
          reset: vi.fn(),
          setControlsEnabled: vi.fn(),
          setIsEnabled: vi.fn(),
          setIsPaused: vi.fn(),
          setVolume: vi.fn(),
          toggleEnabled: vi.fn(),
          togglePause: vi.fn(),
          volume: DEFAULT_AUDIO_VOLUME,
        }}
      >
        <UiStringScreenReaderContext.Provider
          value={{
            cycleVolume: vi.fn(),
            decreasePlaybackRate: vi.fn(),
            decreaseVolume: vi.fn(),
            increasePlaybackRate: vi.fn(),
            increaseVolume: vi.fn(),
            isAudioActive: isScreenReaderActive,
            replay: vi.fn(),
          }}
        >
          <div onClickCapture={mockOnClick}>{children}</div>
        </UiStringScreenReaderContext.Provider>
      </UiStringsAudioContext.Provider>
    );
  }

  const { isAudioEnabled = true, isScreenReaderActive = false } = params;
  const result = render(
    <TestContextWrapper
      isAudioEnabled={isAudioEnabled}
      isScreenReaderActive={isScreenReaderActive}
    >
      <ReadOnIdle delayMs={DELAY_MS}>Bonjour!</ReadOnIdle>
    </TestContextWrapper>
  );

  function rerenderWith(updatedParams: {
    isAudioEnabled: boolean;
    isScreenReaderActive: boolean;
  }) {
    result.rerender(
      <TestContextWrapper {...updatedParams}>
        <ReadOnIdle delayMs={DELAY_MS}>Bonjour!</ReadOnIdle>
      </TestContextWrapper>
    );
  }

  return { mockOnClick, rerenderWith };
}

test('is no-op when audio context is absent', () => {
  const mockOnClick = vi.fn();
  render(
    <div onClickCapture={mockOnClick}>
      <ReadOnIdle delayMs={DELAY_MS}>Bonjour!</ReadOnIdle>
    </div>
  );

  screen.getByText('Bonjour!');
  act(() => {
    vi.advanceTimersByTime(DELAY_MS * 3);
  });
  expect(mockOnClick).not.toHaveBeenCalled();
});

test('triggers periodic click actions while screen reader audio is idle', () => {
  const { mockOnClick } = newRenderer({});

  screen.getByText('Bonjour!');
  expect(mockOnClick).not.toHaveBeenCalled();

  act(() => {
    vi.advanceTimersByTime(DELAY_MS);
  });
  expect(mockOnClick).toHaveBeenCalledTimes(1);

  const clickTarget = mockOnClick.mock.calls[0][0].target as HTMLElement;
  expect(clickTarget.textContent).toEqual('Bonjour!');

  act(() => {
    vi.advanceTimersByTime(DELAY_MS);
  });
  expect(mockOnClick).toHaveBeenCalledTimes(2);
});

test('is no-op when audio is disabled', () => {
  const { mockOnClick } = newRenderer({ isAudioEnabled: false });

  act(() => {
    vi.advanceTimersByTime(DELAY_MS * 3);
  });
  expect(mockOnClick).not.toHaveBeenCalled();
});

test('timer is suspended and reset while screen reader audio is active', () => {
  const { mockOnClick, rerenderWith } = newRenderer({});

  // Simulate audio becoming active just before the idle delay elapses:
  act(() => {
    vi.advanceTimersByTime(DELAY_MS - 1);
  });
  rerenderWith({ isAudioEnabled: true, isScreenReaderActive: true });

  act(() => {
    vi.advanceTimersByTime(DELAY_MS * 3);
  });
  expect(mockOnClick).not.toHaveBeenCalled();

  // Timer should restart from zero once audio is idle again:
  rerenderWith({ isAudioEnabled: true, isScreenReaderActive: false });
  act(() => {
    vi.advanceTimersByTime(DELAY_MS - 1);
  });
  expect(mockOnClick).not.toHaveBeenCalled();

  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(mockOnClick).toHaveBeenCalledTimes(1);
});

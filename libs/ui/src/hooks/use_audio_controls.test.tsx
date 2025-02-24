import { expect, test, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { AudioControls } from '@votingworks/types';
import { UiStringsAudioContext } from '../ui_strings/audio_context';
import { useAudioControls } from './use_audio_controls';
import { UiStringsReactQueryApi, createUiStringsApi } from './ui_strings_api';
import { UiStringScreenReaderContext } from '../ui_strings/ui_string_screen_reader';
import { newTestContext } from '../../test/test_context';
import { DEFAULT_AUDIO_VOLUME } from '../ui_strings/audio_volume';

test('returns external-facing audio context API', () => {
  const { mockApiClient } = newTestContext();
  const mockUiStringsApi: UiStringsReactQueryApi = createUiStringsApi(
    () => mockApiClient
  );

  const mockAudioContextControls = {
    decreasePlaybackRate: vi.fn(),
    increasePlaybackRate: vi.fn(),
    reset: vi.fn(),
    setControlsEnabled: vi.fn(),
    setIsEnabled: vi.fn(),
    toggleEnabled: vi.fn(),
    togglePause: vi.fn(),
  } as const;

  const mockScreenReaderContextControls = {
    decreaseVolume: vi.fn(),
    increaseVolume: vi.fn(),
    replay: vi.fn(),
  } as const;

  function TestContextWrapper(props: { children: React.ReactNode }) {
    const { children } = props;

    return (
      <UiStringsAudioContext.Provider
        value={{
          api: mockUiStringsApi,
          isEnabled: true,
          isPaused: false,
          playbackRate: 1,
          setIsPaused: vi.fn(),
          setVolume: vi.fn(),
          volume: DEFAULT_AUDIO_VOLUME,
          ...mockAudioContextControls,
        }}
      >
        <UiStringScreenReaderContext.Provider
          value={{ ...mockScreenReaderContextControls }}
        >
          {children}
        </UiStringScreenReaderContext.Provider>
      </UiStringsAudioContext.Provider>
    );
  }

  const { result } = renderHook(useAudioControls, {
    wrapper: TestContextWrapper,
  });

  expect(result.current).toEqual<AudioControls>(
    expect.objectContaining({
      ...mockAudioContextControls,
      ...mockScreenReaderContextControls,
    })
  );
});

test('returns no-op API when no audio context is present', () => {
  const { result } = renderHook(useAudioControls);

  expect(result.current).toBeDefined();

  for (const method of Object.values(result.current)) {
    expect(method).not.toThrow();
  }
});

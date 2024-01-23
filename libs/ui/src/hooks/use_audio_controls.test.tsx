import { renderHook } from '@testing-library/react';
import { AudioControls } from '@votingworks/types';
import { UiStringsAudioContext } from '../ui_strings/audio_context';
import { useAudioControls } from './use_audio_controls';
import { UiStringsReactQueryApi, createUiStringsApi } from './ui_strings_api';
import { UiStringScreenReaderContext } from '../ui_strings/ui_string_screen_reader';

test('returns external-facing audio context API', () => {
  const mockUiStringsApi: UiStringsReactQueryApi = createUiStringsApi(() => ({
    getAudioClips: jest.fn(),
    getAvailableLanguages: jest.fn(),
    getUiStringAudioIds: jest.fn(),
    getUiStrings: jest.fn(),
  }));

  const mockAudioContextControls = {
    decreasePlaybackRate: jest.fn(),
    decreaseVolume: jest.fn(),
    increasePlaybackRate: jest.fn(),
    increaseVolume: jest.fn(),
    reset: jest.fn(),
    setIsEnabled: jest.fn(),
    togglePause: jest.fn(),
  } as const;

  const mockScreenReaderContextControls = {
    replay: jest.fn(),
  } as const;

  function TestContextWrapper(props: { children: React.ReactNode }) {
    const { children } = props;

    return (
      <UiStringsAudioContext.Provider
        value={{
          api: mockUiStringsApi,
          gainDb: 0,
          isEnabled: true,
          isPaused: false,
          playbackRate: 1,
          setIsPaused: jest.fn(),
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
    expect.objectContaining(mockAudioContextControls)
  );

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

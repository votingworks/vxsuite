import { renderHook } from '@testing-library/react';
import { UiStringsAudioContext } from '../ui_strings/audio_context';
import { AudioControls, useAudioControls } from './use_audio_controls';
import { UiStringsReactQueryApi, createUiStringsApi } from './ui_strings_api';

test('returns external-facing audio context API', () => {
  const mockUiStringsApi: UiStringsReactQueryApi = createUiStringsApi(() => ({
    getAudioClips: jest.fn(),
    getAvailableLanguages: jest.fn(),
    getUiStringAudioIds: jest.fn(),
    getUiStrings: jest.fn(),
  }));

  const mockAudioControls: AudioControls = {
    decreasePlaybackRate: jest.fn(),
    decreaseVolume: jest.fn(),
    increasePlaybackRate: jest.fn(),
    increaseVolume: jest.fn(),
    reset: jest.fn(),
    setIsEnabled: jest.fn(),
    togglePause: jest.fn(),
  };

  function TestContextWrapper(props: { children: React.ReactNode }) {
    const { children } = props;

    return (
      <UiStringsAudioContext.Provider
        value={{
          api: mockUiStringsApi,
          gainDb: 0,
          isEnabled: true,
          playbackRate: 1,
          ...mockAudioControls,
        }}
      >
        {children}
      </UiStringsAudioContext.Provider>
    );
  }

  const { result } = renderHook(useAudioControls, {
    wrapper: TestContextWrapper,
  });

  expect(result.current).toEqual(mockAudioControls);
});

test('returns no-op API when no audio context is present', () => {
  const { result } = renderHook(useAudioControls);

  expect(result.current).toBeDefined();

  for (const method of Object.values(result.current)) {
    expect(method).not.toThrow();
  }
});

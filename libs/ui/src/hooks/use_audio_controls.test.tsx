import { renderHook } from '@testing-library/react';
import { assert } from '@votingworks/basics';
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

  const mockAudioContextControls = {
    decreasePlaybackRate: jest.fn(),
    decreaseVolume: jest.fn(),
    increasePlaybackRate: jest.fn(),
    increaseVolume: jest.fn(),
    reset: jest.fn(),
    setIsEnabled: jest.fn(),
    togglePause: jest.fn(),
  } as const;

  function TestContextWrapper(props: { children: React.ReactNode }) {
    const { children } = props;

    return (
      <UiStringsAudioContext.Provider
        value={{
          api: mockUiStringsApi,
          gainDb: 0,
          isEnabled: true,
          playbackRate: 1,
          ...mockAudioContextControls,
        }}
      >
        {children}
      </UiStringsAudioContext.Provider>
    );
  }

  const { result } = renderHook(useAudioControls, {
    wrapper: TestContextWrapper,
  });

  expect(result.current).toEqual<AudioControls>(
    expect.objectContaining(mockAudioContextControls)
  );

  window.document.body.focus();
  const testActiveElement = window.document.activeElement;
  assert(testActiveElement instanceof HTMLElement);

  const blurSpy = jest.spyOn(testActiveElement, 'blur');
  const focusSpy = jest.spyOn(testActiveElement, 'focus');

  result.current.replay();

  expect(blurSpy).toHaveBeenCalled();
  expect(focusSpy).toHaveBeenCalled();
});

test('returns no-op API when no audio context is present', () => {
  const { result } = renderHook(useAudioControls);

  expect(result.current).toBeDefined();

  for (const method of Object.values(result.current)) {
    expect(method).not.toThrow();
  }
});

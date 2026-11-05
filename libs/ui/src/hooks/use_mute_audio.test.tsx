import { expect, test } from 'vitest';
import {
  renderHook as renderHookWithoutContext,
  waitFor,
} from '@testing-library/react';
import { useMuteAudio } from './use_mute_audio.js';
import { newTestContext } from '../../test/test_context.js';

test('mutes while shouldMute is true, without changing the setting', async () => {
  const { getAudioContext, renderHook } = newTestContext();

  let shouldMute = false;
  const { rerender, unmount } = renderHook(() => useMuteAudio(shouldMute));
  await waitFor(() =>
    expect(getAudioContext()?.isPlaybackActive).toEqual(true)
  );
  expect(getAudioContext()?.isMuted).toEqual(false);

  shouldMute = true;
  rerender();
  expect(getAudioContext()?.isMuted).toEqual(true);
  expect(getAudioContext()?.isPlaybackActive).toEqual(false);
  expect(getAudioContext()?.isEnabledSetting).toEqual(true);

  shouldMute = false;
  rerender();
  expect(getAudioContext()?.isMuted).toEqual(false);
  expect(getAudioContext()?.isPlaybackActive).toEqual(true);

  unmount();
});

test('unmutes on unmount', async () => {
  const { getAudioContext, render } = newTestContext();

  function Muter(): null {
    useMuteAudio(true);
    return null;
  }

  const { rerender } = render(<Muter />);
  await waitFor(() => expect(getAudioContext()?.isMuted).toEqual(true));
  expect(getAudioContext()?.isPlaybackActive).toEqual(false);

  rerender(<div />);
  expect(getAudioContext()?.isMuted).toEqual(false);
  expect(getAudioContext()?.isPlaybackActive).toEqual(true);
});

test('is a no-op without an audio context', () => {
  const { unmount } = renderHookWithoutContext(() => useMuteAudio(true));
  unmount();
});

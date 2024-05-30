import {
  renderHook as renderHookWithoutContext,
  waitFor,
} from '@testing-library/react';
import { act } from 'react';
import { useAudioEnabled } from './use_audio_enabled';
import { newTestContext } from '../../test/test_context';

test('returns false when audio context is absent', () => {
  const { result } = renderHookWithoutContext(() => useAudioEnabled());

  expect(result.current).toEqual(false);
});

test('returns audio state when rendered within audio context', async () => {
  const { getAudioControls, renderHook } = newTestContext();

  const { result } = renderHook(useAudioEnabled);

  await waitFor(() => expect(result.current).toEqual(true));

  act(() => getAudioControls()!.setIsEnabled(false));
  expect(result.current).toEqual(false);
});

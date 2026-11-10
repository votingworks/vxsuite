import { expect, test } from 'vitest';
import {
  renderHook as renderHookWithoutContext,
  waitFor,
} from '@testing-library/react';
import { act } from 'react';
import { useAudioEnabledByUser } from './use_audio_enabled_by_user.js';
import { newTestContext } from '../../test/test_context.js';

test('returns false when audio context is absent', () => {
  const { result } = renderHookWithoutContext(() => useAudioEnabledByUser());

  expect(result.current).toEqual(false);
});

test('returns audio state when rendered within audio context', async () => {
  const { getAudioControls, renderHook } = newTestContext();

  const { result } = renderHook(useAudioEnabledByUser);

  await waitFor(() => expect(result.current).toEqual(true));

  act(() => getAudioControls()!.setIsEnabledByUser(false));
  expect(result.current).toEqual(false);
});

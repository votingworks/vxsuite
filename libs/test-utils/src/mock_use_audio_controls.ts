/* eslint-disable @typescript-eslint/no-explicit-any */
import { AudioControls } from '@votingworks/types';
import type { vi } from 'vitest';

export function mockUseAudioControls(
  fn: typeof vi.fn
): Record<keyof AudioControls, any> {
  return {
    decreasePlaybackRate: fn(),
    decreaseVolume: fn(),
    increasePlaybackRate: fn(),
    increaseVolume: fn(),
    reset: fn(),
    replay: fn(),
    setControlsEnabled: fn(),
    setIsEnabled: fn(),
    toggleEnabled: fn(),
    togglePause: fn(),
  };
}

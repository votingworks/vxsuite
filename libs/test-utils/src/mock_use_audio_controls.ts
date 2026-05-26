import { AudioControls } from '@votingworks/types';
import type { Mocked, vi } from 'vite-plus/test';

export function mockUseAudioControls(fn: typeof vi.fn): Mocked<AudioControls> {
  return {
    cycleVolume: fn(),
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

import { AudioControls } from '@votingworks/types';
import { Mocked, vi } from 'vitest';

export function mockUseAudioControls(): Mocked<AudioControls> {
  return {
    decreasePlaybackRate: vi.fn(),
    decreaseVolume: vi.fn(),
    increasePlaybackRate: vi.fn(),
    increaseVolume: vi.fn(),
    reset: vi.fn(),
    replay: vi.fn(),
    setControlsEnabled: vi.fn(),
    setIsEnabled: vi.fn(),
    toggleEnabled: vi.fn(),
    togglePause: vi.fn(),
  };
}

import { AudioControls } from '@votingworks/types';

export function fakeUseAudioControls(): AudioControls {
  return {
    decreasePlaybackRate: jest.fn(),
    decreaseVolume: jest.fn(),
    increasePlaybackRate: jest.fn(),
    increaseVolume: jest.fn(),
    reset: jest.fn(),
    replay: jest.fn(),
    setIsEnabled: jest.fn(),
    toggleEnabled: jest.fn(),
    togglePause: jest.fn(),
  };
}

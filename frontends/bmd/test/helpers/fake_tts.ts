import { TextToSpeech } from '../../src/config/types';

/**
 * Builds a fake `TextToSpeech` instance with mock functions.
 */
export function fakeTts(): jest.Mocked<TextToSpeech> {
  let isMuted = true;

  return {
    speak: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn(),
    mute: jest.fn(() => {
      isMuted = true;
      return Promise.resolve();
    }),
    unmute: jest.fn(() => {
      isMuted = false;
    }),
    isMuted: jest.fn(() => isMuted),
    toggleMuted: jest.fn((muted = !isMuted) => {
      isMuted = muted;
      return Promise.resolve();
    }),
  };
}

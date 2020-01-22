import { TextToSpeech } from '../../src/utils/ScreenReader'

/**
 * Builds a fake `TextToSpeech` instance with mock functions.
 */
export default function fakeTTS(): jest.Mocked<TextToSpeech> {
  let isMuted = false

  return {
    speak: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn(),
    mute: jest.fn(() => {
      isMuted = true
    }),
    unmute: jest.fn(() => {
      isMuted = false
    }),
    isMuted: jest.fn(() => isMuted),
  }
}

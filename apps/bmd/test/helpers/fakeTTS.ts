import { TextToSpeech } from '../../src/utils/ScreenReader'

/**
 * Builds a fake `TextToSpeech` instance with mock functions.
 */
export default function fakeTTS(): jest.Mocked<TextToSpeech> {
  return {
    speak: jest.fn(),
    stop: jest.fn(),
  }
}

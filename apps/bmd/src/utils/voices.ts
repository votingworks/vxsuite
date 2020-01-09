import { VoiceSelector } from './ScreenReader'

/**
 * Get a voice suitable for use with `speechSynthesis` APIs to be spoken to US
 * English speakers.
 */
// eslint-disable-next-line import/prefer-default-export
export const getUSEnglishVoice: VoiceSelector = () => {
  // Only use local voices.
  const voices = speechSynthesis.getVoices().filter(voice => voice.localService)

  // Find voices in ranked order.
  return (
    // Prefer the CMU voice present on VxMark.
    voices.find(voice => voice.name === 'English_(America) espeak-ng') ??
    voices.find(
      voice =>
        /\bEnglish\b/i.test(voice.name) && /\b(US|America)\b/i.test(voice.name)
    ) ??
    voices.find(voice => /\bEnglish\b/i.test(voice.name)) ??
    voices.find(voice => voice.lang === 'en-US') ??
    voices.find(voice => voice.lang === 'en') ??
    voices.find(voice => voice.lang.startsWith('en-')) ??
    voices.find(voice => voice.default) ??
    voices[0]
  )
}

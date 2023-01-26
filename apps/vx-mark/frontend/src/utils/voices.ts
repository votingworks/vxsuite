import { VoiceSelector } from '../config/types';

/**
 * Get a voice suitable for use with `speechSynthesis` APIs to be spoken to US
 * English speakers.
 */
export const getUsEnglishVoice: VoiceSelector = () => {
  // Only use local voices.
  const voices = speechSynthesis
    .getVoices()
    .filter((voice) => voice.localService);

  // Find voices in ranked order.
  return (
    // Prefer the CMU voices present on the machine.
    voices.find((voice) => voice.name === 'cmu_us_slt_arctic_hts festival') ??
    voices.find(
      (voice) => voice.name === 'cmu_us_slt_arctic_clunits festival'
    ) ??
    voices.find(
      (voice) =>
        /\bEnglish\b/i.test(voice.name) && /\b(US|America)\b/i.test(voice.name)
    ) ??
    voices.find((voice) => /\bEnglish\b/i.test(voice.name)) ??
    voices.find((voice) => voice.lang === 'en-US') ??
    voices.find((voice) => voice.lang === 'en') ??
    voices.find((voice) => voice.lang.startsWith('en-')) ??
    voices.find((voice) => voice.default) ??
    voices[0]
  );
};

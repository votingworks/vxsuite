import { z } from 'zod/v4';

/**
 * Original mapping and examples pulled from
 * https://cloud.google.com/text-to-speech/docs/phonemes.
 */
// prettier-ignore
const ALL_BY_IPA = {
  // [TODO] Convert phonetic samples to use Vx phonemes.
  "æ": { ipa: 'æ', vx: 'a', sampleWord: 'cat', sampleIpa: 'ˈkæt', consonant: false },
  "ɑː": { ipa: 'ɑː', vx: 'ah', sampleWord: 'cot', sampleIpa: 'ˈkɑːt', consonant: false },
  "ɔː": { ipa: 'ɔː', vx: 'au', sampleWord: 'more', sampleIpa: 'ˈmɔːɹ', consonant: false },
  "eɪ": { ipa: 'eɪ', vx: 'ay', sampleWord: 'shade', sampleIpa: 'ˈʃeɪd', consonant: false },
  "aɪ": { ipa: 'aɪ', vx: 'aye', sampleWord: 'price', sampleIpa: 'ˈpɹaɪs', consonant: false },
  "b": { ipa: 'b', vx: 'b', sampleWord: 'bubble', sampleIpa: 'ˈbʌbəl', consonant: true },
  "ʧ": { ipa: 'ʧ', vx: 'ch', sampleWord: 'changed', sampleIpa: 'ˈʧeɪnʤd', consonant: true },
  "d": { ipa: 'd', vx: 'd', sampleWord: 'dog', sampleIpa: 'ˈdɑːg', consonant: true },
  "iː": { ipa: 'iː', vx: 'ee', sampleWord: 'unique', sampleIpa: 'ˌjuːˈniːk', consonant: false },
  "ɛ": { ipa: 'ɛ', vx: 'eh', sampleWord: 'bed', sampleIpa: 'ˈbɛd', consonant: false },
  "f": { ipa: 'f', vx: 'f', sampleWord: 'frog', sampleIpa: 'ˈfɹɑːg', consonant: true },
  "ɡ": { ipa: 'ɡ', vx: 'g', sampleWord: 'gravely', sampleIpa: 'ˈgɹeɪˌvliː', consonant: true },
  "h": { ipa: 'h', vx: 'h', sampleWord: 'mahogany', sampleIpa: 'məˈhɑːgəˌniː', consonant: true },
  "ɪ": { ipa: 'ɪ', vx: 'i', sampleWord: 'kit', sampleIpa: 'ˈkɪt', consonant: false },
  "ɚ": { ipa: 'ɚ', vx: 'ir', sampleWord: 'bird', sampleIpa: 'ˈbɚd', consonant: false },
  "ʤ": { ipa: 'ʤ', vx: 'j', sampleWord: 'magenta', sampleIpa: 'məˈʤɛntə', consonant: true },
  "k": { ipa: 'k', vx: 'k', sampleWord: 'crown', sampleIpa: 'ˈkɹaʊn', consonant: true },
  "l": { ipa: 'l', vx: 'l', sampleWord: 'lately', sampleIpa: 'ˈleɪtˌliː', consonant: true },
  "m": { ipa: 'm', vx: 'm', sampleWord: 'mapping', sampleIpa: 'ˈmæpəŋ', consonant: true },
  "n": { ipa: 'n', vx: 'n', sampleWord: 'nine', sampleIpa: 'ˈnaɪn', consonant: true },
  "ŋ": { ipa: 'ŋ', vx: 'ng', sampleWord: 'bank', sampleIpa: 'ˈbæŋk', consonant: true },
  "oʊ": { ipa: 'oʊ', vx: 'oa', sampleWord: 'boat', sampleIpa: 'ˈboʊt', consonant: false },
  "ɔɪ": { ipa: 'ɔɪ', vx: 'oi', sampleWord: 'choice', sampleIpa: 'ˈʧɔɪs', consonant: false },
  "uː": { ipa: 'uː', vx: 'oo', sampleWord: 'school', sampleIpa: 'ˈskuːl', consonant: false },
  "aʊ": { ipa: 'aʊ', vx: 'ow', sampleWord: 'flower', sampleIpa: 'ˈflaʊɚ', consonant: false },
  "p": { ipa: 'p', vx: 'p', sampleWord: 'popular', sampleIpa: 'ˈpɑːpjəlɚ', consonant: true },
  "ɹ": { ipa: 'ɹ', vx: 'r', sampleWord: 'roaring', sampleIpa: 'ˈɹɔːɹəŋ', consonant: true },
  "s": { ipa: 's', vx: 's', sampleWord: 'massage', sampleIpa: 'məˈsɑːʒ', consonant: true },
  "ʃ": { ipa: 'ʃ', vx: 'sh', sampleWord: 'shopping', sampleIpa: 'ˈʃɑːpəŋ', consonant: true },
  "ʒ": { ipa: 'ʒ', vx: 'szh', sampleWord: 'leisure', sampleIpa: 'ˈliːʒɚ', consonant: true },
  "t": { ipa: 't', vx: 't', sampleWord: 'tinker', sampleIpa: 'ˈtɪŋkɚ', consonant: true },
  "ð": { ipa: 'ð', vx: 'th', sampleWord: 'mother', sampleIpa: 'ˈmʌðɚ', consonant: true },
  "θ": { ipa: 'θ', vx: 'thh', sampleWord: 'thigh', sampleIpa: 'ˈθaɪ', consonant: true },
  "ʊ": { ipa: 'ʊ', vx: 'ou', sampleWord: 'could', sampleIpa: 'ˈkʊd', consonant: false },
  "ʌ": { ipa: 'ʌ', vx: 'u', sampleWord: 'pulse', sampleIpa: 'ˈpʌls', consonant: false },
  "ə": { ipa: 'ə', vx: 'uh', sampleWord: 'again', sampleIpa: 'əˈgɛn', consonant: false },
  "v": { ipa: 'v', vx: 'v', sampleWord: 'valve', sampleIpa: 'ˈvælv', consonant: true },
  "w": { ipa: 'w', vx: 'w', sampleWord: 'whirlwind', sampleIpa: 'ˈwɚlˌwɪnd', consonant: true },
  "j": { ipa: 'j', vx: 'y', sampleWord: 'younger', sampleIpa: 'ˈjʌŋgɚ', consonant: true },
  "z": { ipa: 'z', vx: 'z', sampleWord: 'zoom', sampleIpa: 'ˈzuːm', consonant: true },
} as const;

const ALL = Object.values(ALL_BY_IPA);

/**
 * Represents a phonetic sound in IPA format. Used for speech synthesis via the
 * Google Cloud Text-To-Speech API.
 *
 * @see https://cloud.google.com/text-to-speech/docs/phonemes
 */
export type IpaPhoneme = keyof typeof ALL_BY_IPA;

const IPA_PHONEMES = Object.keys(ALL_BY_IPA) as IpaPhoneme[];

/** @see {@link IpaPhoneme} */
export const IpaPhonemeSchema = z.union(IPA_PHONEMES.map((p) => z.literal(p)));

/**
 * Display/TTS information for a single phoneme in a given language.
 */
export interface TtsPhoneme {
  /**
   * `true` if the phoneme represents a consonant sound.
   */
  consonant: boolean;

  /**
   * The IPA notation for the phoneme.
   */
  ipa: IpaPhoneme;

  /**
   * A sample use of the phoneme in context of a recognizable word.
   */
  sampleIpa: string;

  /**
   * The plain language equivalent of {@link sampleIpa}.
   */
  sampleWord: string;

  /**
   * The corresponding label used in Vx apps when displaying the phoneme.
   */
  vx: string; // [TODO] Type these as well?
}

/**
 * Provides display/TTS phoneme information for a given language
 */
export interface TtsPhonemes {
  /**
   * All available phonemes for this language, keyed by IPA phoneme.
   */
  allByIpa: Record<IpaPhoneme, TtsPhoneme>;

  /**
   * All available consonant phonemes for this language. Broken out to support
   * split consonant/vowel layouts for the on-screen phonetic keyboard.
   */
  consonants: TtsPhoneme[];

  /**
   * Syllable emphasis/stress annotations: `vx` for display and `ipa` for
   * SSML-based speech synthesis.
   *
   * @see https://cloud.google.com/text-to-speech/docs/phonemes
   */
  stresses: Record<
    PhoneticSyllableStress,
    {
      ipa: string;
      vx: string;
    }
  >;

  /**
   * All available vowel phonemes for this language. Broken out to support
   * split consonant/vowel layouts for the on-screen phonetic keyboard.
   */
  vowels: TtsPhoneme[];
}

export const PhoneticSyllableStressSchema = z.enum(['primary', 'secondary']);

export type PhoneticSyllableStress = z.infer<
  typeof PhoneticSyllableStressSchema
>;

/**
 * Phonemes for US English speech synthesis.
 */
export const en: TtsPhonemes = {
  allByIpa: ALL_BY_IPA,
  consonants: ALL.filter((p) => p.consonant),
  stresses: {
    primary: { ipa: 'ˈ', vx: 'ˈ' },
    secondary: { ipa: 'ˌ', vx: 'ˌ' },
  },
  vowels: ALL.filter((p) => !p.consonant),
};

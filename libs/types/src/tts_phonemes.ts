import { z } from 'zod/v4';
import { LanguageCode } from './language_code';

/**
 * Original mapping and examples pulled from
 * https://cloud.google.com/text-to-speech/docs/phonemes.
 */
// prettier-ignore
const ALL_BY_IPA = {
  "æ":  { ipa: 'æ',  vx: 'a',   sampleWord: 'cat',       sampleIpa: 'ˈkæt',         sampleVx: 'ˈkat',                shortcut: 'a',  consonant: false },
  "ɑː": { ipa: 'ɑː', vx: 'ah',  sampleWord: 'cot',       sampleIpa: 'ˈkɑːt',        sampleVx: 'ˈkaht',               shortcut: 'A',  consonant: false },
  "ɔː": { ipa: 'ɔː', vx: 'au',  sampleWord: 'more',      sampleIpa: 'ˈmɔːɹ',        sampleVx: 'ˈmaur',               shortcut: '4',  consonant: false },
  "eɪ": { ipa: 'eɪ', vx: 'ay',  sampleWord: 'shade',     sampleIpa: 'ˈʃeɪd',        sampleVx: 'ˈshayd',              shortcut: '8',  consonant: false },
  "aɪ": { ipa: 'aɪ', vx: 'aye', sampleWord: 'price',     sampleIpa: 'ˈpɹaɪs',       sampleVx: 'ˈprayes',             shortcut: 'I',  consonant: false },
  "b":  { ipa: 'b',  vx: 'b',   sampleWord: 'bubble',    sampleIpa: 'ˈbʌbəl',       sampleVx: 'ˈbubuhl',             shortcut: 'b',  consonant: true },
  "ʧ":  { ipa: 'ʧ',  vx: 'ch',  sampleWord: 'changed',   sampleIpa: 'ˈʧeɪnʤd',      sampleVx: 'ˈchaynjd',            shortcut: 'c',  consonant: true },
  "d":  { ipa: 'd',  vx: 'd',   sampleWord: 'dog',       sampleIpa: 'ˈdɑːg',        sampleVx: 'ˈdahg',               shortcut: 'd',  consonant: true },
  "iː": { ipa: 'iː', vx: 'ee',  sampleWord: 'unique',    sampleIpa: 'ˌjuːˈniːk',    sampleVx: 'yoo • ˈneek',         shortcut: 'E',  consonant: false },
  "ɛ":  { ipa: 'ɛ',  vx: 'eh',  sampleWord: 'bed',       sampleIpa: 'ˈbɛd',         sampleVx: 'ˈbehd',               shortcut: 'e',  consonant: false },
  "f":  { ipa: 'f',  vx: 'f',   sampleWord: 'frog',      sampleIpa: 'ˈfɹɑːg',       sampleVx: 'ˈfrahg',              shortcut: 'f',  consonant: true },
  "ɡ":  { ipa: 'ɡ',  vx: 'g',   sampleWord: 'gravely',   sampleIpa: 'ˈgɹeɪˌvliː',   sampleVx: 'ˈgray • vlee',        shortcut: 'g',  consonant: true },
  "h":  { ipa: 'h',  vx: 'h',   sampleWord: 'mahogany',  sampleIpa: 'məˈhɑːgəˌniː', sampleVx: 'muh • ˈhahguh • nee', shortcut: 'h',  consonant: true },
  "ɪ":  { ipa: 'ɪ',  vx: 'i',   sampleWord: 'kit',       sampleIpa: 'ˈkɪt',         sampleVx: 'ˈkit',                shortcut: 'i',  consonant: false },
  "ɚ":  { ipa: 'ɚ',  vx: 'ir',  sampleWord: 'bird',      sampleIpa: 'ˈbɚd',         sampleVx: 'ˈbird',               shortcut: 'R',  consonant: false },
  "ʤ":  { ipa: 'ʤ',  vx: 'j',   sampleWord: 'magenta',   sampleIpa: 'məˈʤɛntə',     sampleVx: 'muh • ˈjehntuh',      shortcut: 'j',  consonant: true },
  "k":  { ipa: 'k',  vx: 'k',   sampleWord: 'crown',     sampleIpa: 'ˈkɹaʊn',       sampleVx: 'ˈkrown',              shortcut: 'k',  consonant: true },
  "l":  { ipa: 'l',  vx: 'l',   sampleWord: 'lately',    sampleIpa: 'ˈleɪtˌliː',    sampleVx: 'ˈlayt • lee',         shortcut: 'l',  consonant: true },
  "m":  { ipa: 'm',  vx: 'm',   sampleWord: 'mapping',   sampleIpa: 'ˈmæpəŋ',       sampleVx: 'ˈmapuhng',            shortcut: 'm',  consonant: true },
  "n":  { ipa: 'n',  vx: 'n',   sampleWord: 'nine',      sampleIpa: 'ˈnaɪn',        sampleVx: 'ˈnayen',              shortcut: 'n',  consonant: true },
  "ŋ":  { ipa: 'ŋ',  vx: 'ng',  sampleWord: 'bank',      sampleIpa: 'ˈbæŋk',        sampleVx: 'ˈbangk',              shortcut: 'N',  consonant: true },
  "oʊ": { ipa: 'oʊ', vx: 'oa',  sampleWord: 'boat',      sampleIpa: 'ˈboʊt',        sampleVx: 'ˈboat',               shortcut: 'o',  consonant: false },
  "ɔɪ": { ipa: 'ɔɪ', vx: 'oi',  sampleWord: 'choice',    sampleIpa: 'ˈʧɔɪs',        sampleVx: 'ˈchois',              shortcut: '9',  consonant: false },
  "uː": { ipa: 'uː', vx: 'oo',  sampleWord: 'school',    sampleIpa: 'ˈskuːl',       sampleVx: 'ˈskool',              shortcut: 'O',  consonant: false },
  "aʊ": { ipa: 'aʊ', vx: 'ow',  sampleWord: 'flower',    sampleIpa: 'ˈflaʊɚ',       sampleVx: 'ˈflowir',             shortcut: '6',  consonant: false },
  "p":  { ipa: 'p',  vx: 'p',   sampleWord: 'popular',   sampleIpa: 'ˈpɑːpjəlɚ',    sampleVx: 'ˈpahpyuhlir',         shortcut: 'p',  consonant: true },
  "ɹ":  { ipa: 'ɹ',  vx: 'r',   sampleWord: 'roaring',   sampleIpa: 'ˈɹɔːɹəŋ',      sampleVx: 'ˈrauruhng',           shortcut: 'r',  consonant: true },
  "s":  { ipa: 's',  vx: 's',   sampleWord: 'massage',   sampleIpa: 'məˈsɑːʒ',      sampleVx: 'muh • ˈsahszh',       shortcut: 's',  consonant: true },
  "ʃ":  { ipa: 'ʃ',  vx: 'sh',  sampleWord: 'shopping',  sampleIpa: 'ˈʃɑːpəŋ',      sampleVx: 'ˈshahpuhng',          shortcut: 'S',  consonant: true },
  "ʒ":  { ipa: 'ʒ',  vx: 'szh', sampleWord: 'leisure',   sampleIpa: 'ˈliːʒɚ',       sampleVx: 'ˈleeszhir',           shortcut: 'Z',  consonant: true },
  "t":  { ipa: 't',  vx: 't',   sampleWord: 'tinker',    sampleIpa: 'ˈtɪŋkɚ',       sampleVx: 'ˈtingkir',            shortcut: 't',  consonant: true },
  "ð":  { ipa: 'ð',  vx: 'th',  sampleWord: 'mother',    sampleIpa: 'ˈmʌðɚ',        sampleVx: 'ˈmuthir',             shortcut: 'T',  consonant: true },
  "θ":  { ipa: 'θ',  vx: 'thh', sampleWord: 'thigh',     sampleIpa: 'ˈθaɪ',         sampleVx: 'ˈthhaye',             shortcut: '3',  consonant: true },
  "ʊ":  { ipa: 'ʊ',  vx: 'ou',  sampleWord: 'could',     sampleIpa: 'ˈkʊd',         sampleVx: 'ˈkoud',               shortcut: '7',  consonant: false },
  "ʌ":  { ipa: 'ʌ',  vx: 'u',   sampleWord: 'pulse',     sampleIpa: 'ˈpʌls',        sampleVx: 'ˈpuls',               shortcut: 'u',  consonant: false },
  "ə":  { ipa: 'ə',  vx: 'uh',  sampleWord: 'again',     sampleIpa: 'əˈgɛn',        sampleVx: 'uh • ˈgehn',          shortcut: 'U',  consonant: false },
  "v":  { ipa: 'v',  vx: 'v',   sampleWord: 'valve',     sampleIpa: 'ˈvælv',        sampleVx: 'ˈvalv',               shortcut: 'v',  consonant: true },
  "w":  { ipa: 'w',  vx: 'w',   sampleWord: 'whirlwind', sampleIpa: 'ˈwɚlˌwɪnd',    sampleVx: 'ˈwirl • wind',        shortcut: 'w',  consonant: true },
  "j":  { ipa: 'j',  vx: 'y',   sampleWord: 'younger',   sampleIpa: 'ˈjʌŋgɚ',       sampleVx: 'ˈyunggir',            shortcut: 'y',  consonant: true },
  "z":  { ipa: 'z',  vx: 'z',   sampleWord: 'zoom',      sampleIpa: 'ˈzuːm',        sampleVx: 'ˈzoom',               shortcut: 'z',  consonant: true },
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
   * A sample use of the IPA phoneme in context of a recognizable word.
   */
  sampleIpa: string;

  /**
   * A sample use of the Vx phoneme in context of a recognizable word.
   */
  sampleVx: string;

  /**
   * The plain language equivalent of {@link sampleIpa}.
   */
  sampleWord: string;

  /**
   * Keyboard shortcut for inputting the phoneme in the phonetic editor.
   */
  shortcut: string | null;

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
 * Language-specific phonemes for speech synthesis.
 * [TODO] Actually configure phonemes for the non-English languages.
 */
export const phonemes: Record<LanguageCode, TtsPhonemes> = {
  [LanguageCode.ENGLISH]: {
    allByIpa: ALL_BY_IPA,
    consonants: ALL.filter((p) => p.consonant),
    stresses: {
      primary: { ipa: 'ˈ', vx: 'ˈ' },
      secondary: { ipa: 'ˌ', vx: 'ˌ' },
    },
    vowels: ALL.filter((p) => !p.consonant),
  },
  [LanguageCode.ARABIC]: {
    allByIpa: ALL_BY_IPA,
    consonants: ALL.filter((p) => p.consonant),
    stresses: {
      primary: { ipa: 'ˈ', vx: 'ˈ' },
      secondary: { ipa: 'ˌ', vx: 'ˌ' },
    },
    vowels: ALL.filter((p) => !p.consonant),
  },
  [LanguageCode.BENGALI]: {
    allByIpa: ALL_BY_IPA,
    consonants: ALL.filter((p) => p.consonant),
    stresses: {
      primary: { ipa: 'ˈ', vx: 'ˈ' },
      secondary: { ipa: 'ˌ', vx: 'ˌ' },
    },
    vowels: ALL.filter((p) => !p.consonant),
  },
  [LanguageCode.CHINESE_SIMPLIFIED]: {
    allByIpa: ALL_BY_IPA,
    consonants: ALL.filter((p) => p.consonant),
    stresses: {
      primary: { ipa: 'ˈ', vx: 'ˈ' },
      secondary: { ipa: 'ˌ', vx: 'ˌ' },
    },
    vowels: ALL.filter((p) => !p.consonant),
  },
  [LanguageCode.CHINESE_TRADITIONAL]: {
    allByIpa: ALL_BY_IPA,
    consonants: ALL.filter((p) => p.consonant),
    stresses: {
      primary: { ipa: 'ˈ', vx: 'ˈ' },
      secondary: { ipa: 'ˌ', vx: 'ˌ' },
    },
    vowels: ALL.filter((p) => !p.consonant),
  },
  [LanguageCode.SPANISH]: {
    allByIpa: ALL_BY_IPA,
    consonants: ALL.filter((p) => p.consonant),
    stresses: {
      primary: { ipa: 'ˈ', vx: 'ˈ' },
      secondary: { ipa: 'ˌ', vx: 'ˌ' },
    },
    vowels: ALL.filter((p) => !p.consonant),
  },
};

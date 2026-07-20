import { z } from 'zod/v4';
import { LanguageCode } from './language_code';

// prettier-ignore
export const ALL_VOWELS_ARR = [// [TODO] Incomplete - fill out;
  'æ', 'ɑː', 'ɔː', 'eɪ', 'aɪ', 'iː', 'ɛ', 'ɪ', 'ɚ', 'oʊ', 'ɔɪ', 'uː', 'aʊ', 'ʊ',
  'ʌ', 'ə', 'a', 'ai', 'au', 'e', 'ei', 'eu', 'i', 'o', 'oi', 'ou', 'u', 'ə',
] as const;

export const ALL_VOWELS = new Set<IpaPhoneme>(ALL_VOWELS_ARR);

/**
 * Original mapping and examples pulled from
 * https://cloud.google.com/text-to-speech/docs/phonemes.
 */
// prettier-ignore
const ENGLISH_BY_IPA = {
  'æ':  { ipa: 'æ',  vx: 'a',   sampleWord: 'cat',       sampleIpa: 'ˈkæt',         sampleVx: 'ˈkat',                shortcut: 'a' },
  'ɑː': { ipa: 'ɑː', vx: 'ah',  sampleWord: 'cot',       sampleIpa: 'ˈkɑːt',        sampleVx: 'ˈkaht',               shortcut: 'A' },
  'ɔː': { ipa: 'ɔː', vx: 'au',  sampleWord: 'more',      sampleIpa: 'ˈmɔːɹ',        sampleVx: 'ˈmaur',               shortcut: '4' },
  'eɪ': { ipa: 'eɪ', vx: 'ay',  sampleWord: 'shade',     sampleIpa: 'ˈʃeɪd',        sampleVx: 'ˈshayd',              shortcut: '8' },
  'aɪ': { ipa: 'aɪ', vx: 'aye', sampleWord: 'price',     sampleIpa: 'ˈpɹaɪs',       sampleVx: 'ˈprayes',             shortcut: 'I' },
  'b':  { ipa: 'b',  vx: 'b',   sampleWord: 'bubble',    sampleIpa: 'ˈbʌbəl',       sampleVx: 'ˈbubuhl',             shortcut: 'b' },
  'ʧ':  { ipa: 'ʧ',  vx: 'ch',  sampleWord: 'changed',   sampleIpa: 'ˈʧeɪnʤd',      sampleVx: 'ˈchaynjd',            shortcut: 'c' },
  'd':  { ipa: 'd',  vx: 'd',   sampleWord: 'dog',       sampleIpa: 'ˈdɑːg',        sampleVx: 'ˈdahg',               shortcut: 'd' },
  'iː': { ipa: 'iː', vx: 'ee',  sampleWord: 'unique',    sampleIpa: 'ˌjuːˈniːk',    sampleVx: 'yoo • ˈneek',         shortcut: 'E' },
  'ɛ':  { ipa: 'ɛ',  vx: 'eh',  sampleWord: 'bed',       sampleIpa: 'ˈbɛd',         sampleVx: 'ˈbehd',               shortcut: 'e' },
  'f':  { ipa: 'f',  vx: 'f',   sampleWord: 'frog',      sampleIpa: 'ˈfɹɑːg',       sampleVx: 'ˈfrahg',              shortcut: 'f' },
  'ɡ':  { ipa: 'ɡ',  vx: 'g',   sampleWord: 'gravely',   sampleIpa: 'ˈgɹeɪˌvliː',   sampleVx: 'ˈgray • vlee',        shortcut: 'g' },
  'h':  { ipa: 'h',  vx: 'h',   sampleWord: 'mahogany',  sampleIpa: 'məˈhɑːgəˌniː', sampleVx: 'muh • ˈhahguh • nee', shortcut: 'h' },
  'ɪ':  { ipa: 'ɪ',  vx: 'i',   sampleWord: 'kit',       sampleIpa: 'ˈkɪt',         sampleVx: 'ˈkit',                shortcut: 'i' },
  'ɚ':  { ipa: 'ɚ',  vx: 'ir',  sampleWord: 'bird',      sampleIpa: 'ˈbɚd',         sampleVx: 'ˈbird',               shortcut: 'R' },
  'ʤ':  { ipa: 'ʤ',  vx: 'j',   sampleWord: 'magenta',   sampleIpa: 'məˈʤɛntə',     sampleVx: 'muh • ˈjehntuh',      shortcut: 'j' },
  'k':  { ipa: 'k',  vx: 'k',   sampleWord: 'crown',     sampleIpa: 'ˈkɹaʊn',       sampleVx: 'ˈkrown',              shortcut: 'k' },
  'l':  { ipa: 'l',  vx: 'l',   sampleWord: 'lately',    sampleIpa: 'ˈleɪtˌliː',    sampleVx: 'ˈlayt • lee',         shortcut: 'l' },
  'm':  { ipa: 'm',  vx: 'm',   sampleWord: 'mapping',   sampleIpa: 'ˈmæpəŋ',       sampleVx: 'ˈmapuhng',            shortcut: 'm' },
  'n':  { ipa: 'n',  vx: 'n',   sampleWord: 'nine',      sampleIpa: 'ˈnaɪn',        sampleVx: 'ˈnayen',              shortcut: 'n' },
  'ŋ':  { ipa: 'ŋ',  vx: 'ng',  sampleWord: 'bank',      sampleIpa: 'ˈbæŋk',        sampleVx: 'ˈbangk',              shortcut: 'N' },
  'oʊ': { ipa: 'oʊ', vx: 'oa',  sampleWord: 'boat',      sampleIpa: 'ˈboʊt',        sampleVx: 'ˈboat',               shortcut: 'o' },
  'ɔɪ': { ipa: 'ɔɪ', vx: 'oi',  sampleWord: 'choice',    sampleIpa: 'ˈʧɔɪs',        sampleVx: 'ˈchois',              shortcut: '9' },
  'uː': { ipa: 'uː', vx: 'oo',  sampleWord: 'school',    sampleIpa: 'ˈskuːl',       sampleVx: 'ˈskool',              shortcut: 'O' },
  'aʊ': { ipa: 'aʊ', vx: 'ow',  sampleWord: 'flower',    sampleIpa: 'ˈflaʊɚ',       sampleVx: 'ˈflowir',             shortcut: '6' },
  'p':  { ipa: 'p',  vx: 'p',   sampleWord: 'popular',   sampleIpa: 'ˈpɑːpjəlɚ',    sampleVx: 'ˈpahpyuhlir',         shortcut: 'p' },
  'ɹ':  { ipa: 'ɹ',  vx: 'r',   sampleWord: 'roaring',   sampleIpa: 'ˈɹɔːɹəŋ',      sampleVx: 'ˈrauruhng',           shortcut: 'r' },
  's':  { ipa: 's',  vx: 's',   sampleWord: 'massage',   sampleIpa: 'məˈsɑːʒ',      sampleVx: 'muh • ˈsahszh',       shortcut: 's' },
  'ʃ':  { ipa: 'ʃ',  vx: 'sh',  sampleWord: 'shopping',  sampleIpa: 'ˈʃɑːpəŋ',      sampleVx: 'ˈshahpuhng',          shortcut: 'S' },
  'ʒ':  { ipa: 'ʒ',  vx: 'szh', sampleWord: 'leisure',   sampleIpa: 'ˈliːʒɚ',       sampleVx: 'ˈleeszhir',           shortcut: 'Z' },
  't':  { ipa: 't',  vx: 't',   sampleWord: 'tinker',    sampleIpa: 'ˈtɪŋkɚ',       sampleVx: 'ˈtingkir',            shortcut: 't' },
  'ð':  { ipa: 'ð',  vx: 'th',  sampleWord: 'mother',    sampleIpa: 'ˈmʌðɚ',        sampleVx: 'ˈmuthir',             shortcut: 'T' },
  'θ':  { ipa: 'θ',  vx: 'thh', sampleWord: 'thigh',     sampleIpa: 'ˈθaɪ',         sampleVx: 'ˈthhaye',             shortcut: '3' },
  'ʊ':  { ipa: 'ʊ',  vx: 'ou',  sampleWord: 'could',     sampleIpa: 'ˈkʊd',         sampleVx: 'ˈkoud',               shortcut: '7' },
  'ʌ':  { ipa: 'ʌ',  vx: 'u',   sampleWord: 'pulse',     sampleIpa: 'ˈpʌls',        sampleVx: 'ˈpuls',               shortcut: 'u' },
  'ə':  { ipa: 'ə',  vx: 'uh',  sampleWord: 'again',     sampleIpa: 'əˈgɛn',        sampleVx: 'uh • ˈgehn',          shortcut: 'U' },
  'v':  { ipa: 'v',  vx: 'v',   sampleWord: 'valve',     sampleIpa: 'ˈvælv',        sampleVx: 'ˈvalv',               shortcut: 'v' },
  'w':  { ipa: 'w',  vx: 'w',   sampleWord: 'whirlwind', sampleIpa: 'ˈwɚlˌwɪnd',    sampleVx: 'ˈwirl • wind',        shortcut: 'w' },
  'j':  { ipa: 'j',  vx: 'y',   sampleWord: 'younger',   sampleIpa: 'ˈjʌŋgɚ',       sampleVx: 'ˈyunggir',            shortcut: 'y' },
  'z':  { ipa: 'z',  vx: 'z',   sampleWord: 'zoom',      sampleIpa: 'ˈzuːm',        sampleVx: 'ˈzoom',               shortcut: 'z' },
} as const;

const ALL_ENGLISH = Object.values(ENGLISH_BY_IPA);

/**
 * Original mapping and examples pulled from
 * https://cloud.google.com/text-to-speech/docs/phonemes.
 */
// prettier-ignore
const SPANISH_BY_IPA = {
  'a':  { ipa: 'a',  vx: 'a',   sampleWord: 'cala',        sampleIpa: 'ˈkala',        sampleVx: 'ˈkala' },
  'ai': { ipa: 'ai', vx: 'ai',  sampleWord: 'jamaicanos',  sampleIpa: 'xamaiˈkanos',  sampleVx: 'xamaiˈkanos' },
  'au': { ipa: 'au', vx: 'au',  sampleWord: 'restaurante', sampleIpa: 'restauˈɾante', sampleVx: 'rrestauˈrrante' },
  'b':  { ipa: 'b',  vx: 'b',   sampleWord: 'bobo',        sampleIpa: 'ˈbobo',        sampleVx: 'ˈbobo' },
  'ʧ':  { ipa: 'ʧ',  vx: 'ch',  sampleWord: 'churro',      sampleIpa: 'ˈtʃuro',       sampleVx: 'ˈtshurro' },
  'd':  { ipa: 'd',  vx: 'd',   sampleWord: 'dedo',        sampleIpa: 'ˈdedo',        sampleVx: 'ˈdedo' },
  'e':  { ipa: 'e',  vx: 'e',   sampleWord: 'tele',        sampleIpa: 'ˈtele',        sampleVx: 'ˈtele' },
  'ei': { ipa: 'ei', vx: 'ei',  sampleWord: 'aceituna',    sampleIpa: 'aseiˈtuna',    sampleVx: 'aseiˈtuna' },
  'eu': { ipa: 'eu', vx: 'eu',  sampleWord: 'euro',        sampleIpa: 'ˈeuɾo',        sampleVx: 'ˈeurro' },
  'f':  { ipa: 'f',  vx: 'f',   sampleWord: 'foca',        sampleIpa: 'ˈfoka',        sampleVx: 'ˈfoka' },
  'g':  { ipa: 'g',  vx: 'g',   sampleWord: 'gagá',        sampleIpa: 'gaˈga',        sampleVx: 'gaˈga' },
  'i':  { ipa: 'i',  vx: 'i',   sampleWord: 'pirueta',     sampleIpa: 'piɾˈweta',     sampleVx: 'pirrˈweta' },
  'dʒ': { ipa: 'dʒ', vx: 'j',   sampleWord: 'jennifer',    sampleIpa: 'ˈdʒenifəɹ',    sampleVx: 'ˈyenifuhR' },
  'k':  { ipa: 'k',  vx: 'k',   sampleWord: 'casa',        sampleIpa: 'ˈkasa',        sampleVx: 'ˈkasa' },
  'l':  { ipa: 'l',  vx: 'l',   sampleWord: 'lento',       sampleIpa: 'ˈlento',       sampleVx: 'ˈlento' },
  'm':  { ipa: 'm',  vx: 'm',   sampleWord: 'mano',        sampleIpa: 'ˈmano',        sampleVx: 'ˈmano' },
  'n':  { ipa: 'n',  vx: 'n',   sampleWord: 'mano',        sampleIpa: 'ˈmano',        sampleVx: 'ˈmano' },
  'ŋ':  { ipa: 'ŋ',  vx: 'N',   sampleWord: 'song',        sampleIpa: 'ˈsoŋ',         sampleVx: 'ˈsoN' },
  'ɲ':  { ipa: 'ɲ',  vx: 'ny',  sampleWord: 'ñoño',        sampleIpa: 'ˈɲoɲo',        sampleVx: 'ˈnyonyo' },
  'o':  { ipa: 'o',  vx: 'o',   sampleWord: 'cordura',     sampleIpa: 'koɾˈduɾa',     sampleVx: 'korrˈdurra' },
  'oi': { ipa: 'oi', vx: 'oi',  sampleWord: 'hoy',         sampleIpa: 'ˈoi',          sampleVx: 'ˈoi' },
  'ou': { ipa: 'ou', vx: 'ou',  sampleWord: 'roupeiro',    sampleIpa: 'rouˈpeiɾo',    sampleVx: 'rrouˈpeirro' },
  'p':  { ipa: 'p',  vx: 'p',   sampleWord: 'pelo',        sampleIpa: 'ˈpelo',        sampleVx: 'ˈpelo' },
  'ɹ':  { ipa: 'ɹ',  vx: 'R',   sampleWord: 'car',         sampleIpa: 'ˈkaɹ',         sampleVx: 'ˈkaR' },
  'ɾ':  { ipa: 'ɾ',  vx: 'r',   sampleWord: 'pero',        sampleIpa: 'ˈpeɾo',        sampleVx: 'ˈperro' },
  'r':  { ipa: 'r',  vx: 'rr',  sampleWord: 'perro',       sampleIpa: 'ˈpero',        sampleVx: 'ˈperro' },
  's':  { ipa: 's',  vx: 's',   sampleWord: 'cielo',       sampleIpa: 'ˈsjelo',       sampleVx: 'ˈsyelo' },
  'ʃ':  { ipa: 'ʃ',  vx: 'sh',  sampleWord: 'shopping',    sampleIpa: 'ˈʃopiŋ',       sampleVx: 'ˈshopiN' },
  't':  { ipa: 't',  vx: 't',   sampleWord: 'tela',        sampleIpa: 'ˈtela',        sampleVx: 'ˈtela' },
  'ð':  { ipa: 'ð',  vx: 'th',  sampleWord: 'father',      sampleIpa: 'ˈfaðəɹ',       sampleVx: 'ˈfathuhR' },
  'θ':  { ipa: 'θ',  vx: 'thh', sampleWord: 'thorn',       sampleIpa: 'ˈθoɹn',        sampleVx: 'ˈthhoRn' },
  'u':  { ipa: 'u',  vx: 'u',   sampleWord: 'documentar',  sampleIpa: 'dokumenˈtaɾ',  sampleVx: 'dokumenˈtarr' },
  'ə':  { ipa: 'ə',  vx: 'uh',  sampleWord: 'google',      sampleIpa: 'ˈgugəl',       sampleVx: 'ˈguguhl' },
  'v':  { ipa: 'v',  vx: 'v',   sampleWord: 'voice',       sampleIpa: 'ˈvois',        sampleVx: 'ˈvois' },
  'w':  { ipa: 'w',  vx: 'w',   sampleWord: 'water',       sampleIpa: 'ˈwotəɹ',       sampleVx: 'ˈwotuhR' },
  'x':  { ipa: 'x',  vx: 'x',   sampleWord: 'jota',        sampleIpa: 'ˈxota',        sampleVx: 'ˈxota' },
  'j':  { ipa: 'j',  vx: 'y',   sampleWord: 'yo',          sampleIpa: 'ˈjo',          sampleVx: 'ˈyo' },
  'z':  { ipa: 'z',  vx: 'z',   sampleWord: 'president',   sampleIpa: 'ˈpɹezidənt',   sampleVx: 'ˈpReziduhnt' },
} as const;

const ALL_SPANISH = Object.values(SPANISH_BY_IPA);

/**
 * Represents a phonetic sound in IPA format. Used for speech synthesis via the
 * Google Cloud Text-To-Speech API.
 *
 * @see https://cloud.google.com/text-to-speech/docs/phonemes
 */
export type IpaPhoneme =
  | keyof typeof ENGLISH_BY_IPA
  | keyof typeof SPANISH_BY_IPA;

const IPA_PHONEMES = new Set([
  ...(Object.keys(ENGLISH_BY_IPA) as IpaPhoneme[]),
  ...(Object.keys(SPANISH_BY_IPA) as IpaPhoneme[]),
]);

/** @see {@link IpaPhoneme} */
export const IpaPhonemeSchema = z.union(
  [...IPA_PHONEMES].map((p) => z.literal(p))
);

/**
 * Display/TTS information for a single phoneme in a given language.
 */
export interface TtsPhoneme {
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
  shortcut?: string;

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
  allByIpa: Partial<Record<IpaPhoneme, TtsPhoneme>>;

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

const STANDARD_STRESSES: TtsPhonemes['stresses'] = {
  primary: { ipa: 'ˈ', vx: 'ˈ' },
  secondary: { ipa: 'ˌ', vx: 'ˌ' },
};

/**
 * Language-specific phonemes for speech synthesis.
 * [TODO] Actually configure phonemes for the non-English languages.
 */
export const phonemes: Record<LanguageCode, TtsPhonemes> = {
  [LanguageCode.ENGLISH]: {
    allByIpa: ENGLISH_BY_IPA,
    consonants: ALL_ENGLISH.filter((p) => !ALL_VOWELS.has(p.ipa)),
    stresses: STANDARD_STRESSES,
    vowels: ALL_ENGLISH.filter((p) => ALL_VOWELS.has(p.ipa)),
  },
  [LanguageCode.ARABIC]: {
    allByIpa: ENGLISH_BY_IPA,
    consonants: ALL_ENGLISH.filter((p) => !ALL_VOWELS.has(p.ipa)),
    stresses: STANDARD_STRESSES,
    vowels: ALL_ENGLISH.filter((p) => ALL_VOWELS.has(p.ipa)),
  },
  [LanguageCode.BENGALI]: {
    allByIpa: ENGLISH_BY_IPA,
    consonants: ALL_ENGLISH.filter((p) => !ALL_VOWELS.has(p.ipa)),
    stresses: STANDARD_STRESSES,
    vowels: ALL_ENGLISH.filter((p) => ALL_VOWELS.has(p.ipa)),
  },
  [LanguageCode.CHINESE_SIMPLIFIED]: {
    allByIpa: ENGLISH_BY_IPA,
    consonants: ALL_ENGLISH.filter((p) => !ALL_VOWELS.has(p.ipa)),
    stresses: STANDARD_STRESSES,
    vowels: ALL_ENGLISH.filter((p) => ALL_VOWELS.has(p.ipa)),
  },
  [LanguageCode.CHINESE_TRADITIONAL]: {
    allByIpa: ENGLISH_BY_IPA,
    consonants: ALL_ENGLISH.filter((p) => !ALL_VOWELS.has(p.ipa)),
    stresses: STANDARD_STRESSES,
    vowels: ALL_ENGLISH.filter((p) => ALL_VOWELS.has(p.ipa)),
  },
  [LanguageCode.HINDI]: {
    allByIpa: ENGLISH_BY_IPA,
    consonants: ALL_ENGLISH.filter((p) => !ALL_VOWELS.has(p.ipa)),
    stresses: STANDARD_STRESSES,
    vowels: ALL_ENGLISH.filter((p) => ALL_VOWELS.has(p.ipa)),
  },
  [LanguageCode.JAPANESE]: {
    allByIpa: ENGLISH_BY_IPA,
    consonants: ALL_ENGLISH.filter((p) => !ALL_VOWELS.has(p.ipa)),
    stresses: STANDARD_STRESSES,
    vowels: ALL_ENGLISH.filter((p) => ALL_VOWELS.has(p.ipa)),
  },
  [LanguageCode.KHMER]: {
    allByIpa: ENGLISH_BY_IPA,
    consonants: ALL_ENGLISH.filter((p) => !ALL_VOWELS.has(p.ipa)),
    stresses: STANDARD_STRESSES,
    vowels: ALL_ENGLISH.filter((p) => ALL_VOWELS.has(p.ipa)),
  },
  [LanguageCode.KOREAN]: {
    allByIpa: ENGLISH_BY_IPA,
    consonants: ALL_ENGLISH.filter((p) => !ALL_VOWELS.has(p.ipa)),
    stresses: STANDARD_STRESSES,
    vowels: ALL_ENGLISH.filter((p) => ALL_VOWELS.has(p.ipa)),
  },
  [LanguageCode.SPANISH]: {
    allByIpa: SPANISH_BY_IPA,
    consonants: ALL_SPANISH.filter((p) => !ALL_VOWELS.has(p.ipa)),
    stresses: STANDARD_STRESSES,
    vowels: ALL_SPANISH.filter((p) => ALL_VOWELS.has(p.ipa)),
  },
  [LanguageCode.TAGALOG]: {
    allByIpa: ENGLISH_BY_IPA,
    consonants: ALL_ENGLISH.filter((p) => !ALL_VOWELS.has(p.ipa)),
    stresses: STANDARD_STRESSES,
    vowels: ALL_ENGLISH.filter((p) => ALL_VOWELS.has(p.ipa)),
  },
  [LanguageCode.VIETNAMESE]: {
    allByIpa: ENGLISH_BY_IPA,
    consonants: ALL_ENGLISH.filter((p) => !ALL_VOWELS.has(p.ipa)),
    stresses: STANDARD_STRESSES,
    vowels: ALL_ENGLISH.filter((p) => ALL_VOWELS.has(p.ipa)),
  },
};

export function isVowel(p: IpaPhoneme): boolean {
  return ALL_VOWELS.has(p);
}

import { z } from 'zod/v4';
import { LanguageCode } from './language_code';

// prettier-ignore
export const ALL_VOWELS_ARR = [// [TODO] Incomplete - fill out;
  'æ', 'ɑː', 'ɔː', 'eɪ', 'aɪ', 'ɪː', 'ɛ', 'ɪ', 'ɚ', 'oʊ', 'ɔɪ', 'uː', 'aʊ', 'ʊ',
  'ʌ', 'ə', 'a', 'ai', 'au', 'e', 'ei', 'eu', 'i', 'o', 'oi', 'ou', 'u', 'ə',
  'ɯ', 'ø', 'a:', 'ãː', 'ə̃', 'ẽː', 'ɛ̃ː', 'ɪ', 'ɪː', 'ɪ̃ː', 'ɪ̃', 'ɔː', 'ɔ̃ː',
  'õː', 'ʊ', 'ʊ̃', 'ũː', 'oː', 'ui', 'iu',
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
  'ɪː': { ipa: 'ɪː', vx: 'ee',  sampleWord: 'unique',    sampleIpa: 'ˌjuːˈnɪːk',    sampleVx: 'yoo • ˈneek',         shortcut: 'E' },
  'ɛ':  { ipa: 'ɛ',  vx: 'eh',  sampleWord: 'bed',       sampleIpa: 'ˈbɛd',         sampleVx: 'ˈbehd',               shortcut: 'e' },
  'f':  { ipa: 'f',  vx: 'f',   sampleWord: 'frog',      sampleIpa: 'ˈfɹɑːg',       sampleVx: 'ˈfrahg',              shortcut: 'f' },
  'ɡ':  { ipa: 'ɡ',  vx: 'g',   sampleWord: 'gravely',   sampleIpa: 'ˈgɹeɪˌvlɪː',   sampleVx: 'ˈgray • vlee',        shortcut: 'g' },
  'h':  { ipa: 'h',  vx: 'h',   sampleWord: 'mahogany',  sampleIpa: 'məˈhɑːgəˌnɪː', sampleVx: 'muh • ˈhahguh • nee', shortcut: 'h' },
  'ɪ':  { ipa: 'ɪ',  vx: 'i',   sampleWord: 'kit',       sampleIpa: 'ˈkɪt',         sampleVx: 'ˈkit',                shortcut: 'i' },
  'ɚ':  { ipa: 'ɚ',  vx: 'ir',  sampleWord: 'bird',      sampleIpa: 'ˈbɚd',         sampleVx: 'ˈbird',               shortcut: 'R' },
  'ʤ':  { ipa: 'ʤ',  vx: 'j',   sampleWord: 'magenta',   sampleIpa: 'məˈʤɛntə',     sampleVx: 'muh • ˈjehntuh',      shortcut: 'j' },
  'k':  { ipa: 'k',  vx: 'k',   sampleWord: 'crown',     sampleIpa: 'ˈkɹaʊn',       sampleVx: 'ˈkrown',              shortcut: 'k' },
  'l':  { ipa: 'l',  vx: 'l',   sampleWord: 'lately',    sampleIpa: 'ˈleɪtˌlɪː',    sampleVx: 'ˈlayt • lee',         shortcut: 'l' },
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
  'ʒ':  { ipa: 'ʒ',  vx: 'szh', sampleWord: 'leisure',   sampleIpa: 'ˈlɪːʒɚ',       sampleVx: 'ˈleeszhir',           shortcut: 'Z' },
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

/**
 * Original mapping and examples pulled from
 * https://cloud.google.com/text-to-speech/docs/phonemes.
 */
// prettier-ignore
const HINDI_BY_IPA = {
  'a:':  { ipa: 'a:',  vx: 'a:',    sampleWord: 'बात',         sampleIpa: 'ˈbaːt̪',           sampleVx: 'ˈbaːt̪' },
  'ãː':  { ipa: 'ãː',  vx: 'ãː',    sampleWord: 'लड़कियां',     sampleIpa: 'ˈləɽkɪjãː',       sampleVx: 'ˈləɽkɪjãː' },
  'b':   { ipa: 'b',   vx: 'b',     sampleWord: 'बादल',        sampleIpa: 'ˈbaːd̪əl',         sampleVx: 'ˈbaːd̪əl' },
  'bʰ':  { ipa: 'bʰ',  vx: 'bʰ',    sampleWord: 'भारत',        sampleIpa: 'ˈbʰaːrət̪',        sampleVx: 'ˈbʰaːrət̪' },
  'd̪':  { ipa: 'd̪',  vx : 'd̪',   sampleWord: 'दाल',         sampleIpa: 'ˈd̪aːl',           sampleVx: 'ˈd̪aːl' },
  'd̪ʰ': { ipa: 'd̪ʰ', vx: 'd̪ʰ',   sampleWord: 'धूम',         sampleIpa: 'ˈd̪ʰuːm',          sampleVx: 'ˈd̪ʰuːm' },
  'ʤ':   { ipa: 'ʤ',   vx: 'ʤ',     sampleWord: 'जंगल',        sampleIpa: 'ˈdʒəngəl',         sampleVx: 'ˈdʒəngəl' },
  'ʤʰ':  { ipa: 'ʤʰ',  vx: 'ʤʰ',    sampleWord: 'मुझ',         sampleIpa: 'ˈmʊdʒʰ',           sampleVx: 'ˈmʊdʒʰ' },
  'ɖ':   { ipa: 'ɖ',   vx: 'ɖ',     sampleWord: 'डमरू',        sampleIpa: 'ˈɖəmruː',          sampleVx: 'ˈɖəmruː' },
  'ɖʰ':  { ipa: 'ɖʰ',  vx: 'ɖʰ',    sampleWord: 'ढोलक',        sampleIpa: 'ˈɖʰoːlək',         sampleVx: 'ˈɖʰoːlək' },
  'e':   { ipa: 'e',   vx: 'e',     sampleWord: 'केला',        sampleIpa: 'ˈkeːlaː',          sampleVx: 'ˈkeːlaː' },
  'ẽː':  { ipa: 'ẽː',  vx: 'ẽː',    sampleWord: 'किताबें',     sampleIpa: 'kɪˈt̪aːbẽː',      sampleVx: 'kɪˈt̪aːbẽː' },
  'ə':   { ipa: 'ə',   vx: 'ə',     sampleWord: 'अलग',         sampleIpa: 'ˈələg',            sampleVx: 'ˈələg' },
  'ə̃':  { ipa: 'ə̃',  vx: 'ə̃',    sampleWord: 'हंसना',       sampleIpa: 'ˈhə̃snaː',         sampleVx: 'ˈhə̃snaː' },
  'ɛ':   { ipa: 'ɛ',   vx: 'ɛ',     sampleWord: 'फैलाव',       sampleIpa: 'ˈfɛːlaːʋ',         sampleVx: 'ˈfɛːlaːʋ' },
  'ɛ̃ː': { ipa: 'ɛ̃ː', vx: 'ɛ̃ː',   sampleWord: 'मैं',         sampleIpa: 'ˈmɛ̃ː',            sampleVx: 'ˈmɛ̃ː' },
  'f':   { ipa: 'f',   vx: 'f',     sampleWord: 'फल',          sampleIpa: 'ˈfəl',             sampleVx: 'ˈfəl' },
  'g':   { ipa: 'g',   vx: 'g',     sampleWord: 'गाय',         sampleIpa: 'ˈgaːeː',           sampleVx: 'ˈgaːeː' },
  'gʰ':  { ipa: 'gʰ',  vx: 'gʰ',    sampleWord: 'घर',          sampleIpa: 'ˈgʰər',            sampleVx: 'ˈgʰər' },
  'h':   { ipa: 'h',   vx: 'h',     sampleWord: 'होना',        sampleIpa: 'ˈhoːnaː',          sampleVx: 'ˈhoːnaː' },
  'ɪː':  { ipa: 'ɪː',  vx: 'ɪː',    sampleWord: 'खीर',         sampleIpa: 'ˈkʰɪːr',           sampleVx: 'ˈkʰɪːr' },
  'ɪ̃ː': { ipa: 'ɪ̃ː',  vx: 'ɪ̃ː',  sampleWord: 'नहीं',        sampleIpa: 'ˈnəhɪ̃ː',          sampleVx: 'ˈnəhɪ̃ː' },
  'ɪ':   { ipa: 'ɪ',   vx: 'ɪ',     sampleWord: 'इच्छा',       sampleIpa: 'ˈɪtʃtʃʰaː',        sampleVx: 'ˈɪtʃtʃʰaː' },
  'ɪ̃':  { ipa: 'ɪ̃',  vx: 'ɪ̃',    sampleWord: 'सिंचाई',      sampleIpa: 'sɪ̃ˈtʃaːɪː',       sampleVx: 'sɪ̃ˈtʃaːɪː' },
  'j':   { ipa: 'j',   vx: 'j',     sampleWord: 'योग',         sampleIpa: 'ˈjoːg',            sampleVx: 'ˈjoːg' },
  'k':   { ipa: 'k',   vx: 'k',     sampleWord: 'किताब',       sampleIpa: 'kɪˈt̪aːb',         sampleVx: 'kɪˈt̪aːb' },
  'kʰ':  { ipa: 'kʰ',  vx: 'kʰ',    sampleWord: 'खान',         sampleIpa: 'ˈkʰaːn',           sampleVx: 'ˈkʰaːn' },
  'l':   { ipa: 'l',   vx: 'l',     sampleWord: 'लड़कियां',     sampleIpa: 'ˈləɽkɪjãː',       sampleVx: 'ˈləɽkɪjãː' },
  'm':   { ipa: 'm',   vx: 'm',     sampleWord: 'मंत्र',       sampleIpa: 'ˈmənt̪rə',         sampleVx: 'ˈmənt̪rə' },
  'n':   { ipa: 'n',   vx: 'n',     sampleWord: 'नमक',         sampleIpa: 'ˈnəmək',           sampleVx: 'ˈnəmək' },
  'ɳ':   { ipa: 'ɳ',   vx: 'ɳ',     sampleWord: 'नारायण',      sampleIpa: 'naːˈraːjəɳ',       sampleVx: 'naːˈraːjəɳ' },
  'ŋ':   { ipa: 'ŋ',   vx: 'ŋ',     sampleWord: 'लंका',        sampleIpa: 'ˈlənkaː',          sampleVx: 'ˈlənkaː' },
  'oː':  { ipa: 'oː',  vx: 'oː',    sampleWord: 'ओखली',        sampleIpa: 'ˈoːkʰlɪː',         sampleVx: 'ˈoːkʰlɪː' },
  'õː':  { ipa: 'õː',  vx: 'õː',    sampleWord: 'क्यों',       sampleIpa: 'ˈkjõː',           sampleVx: 'ˈkjõː' },
  'ɔː':  { ipa: 'ɔː',  vx: 'ɔː',    sampleWord: 'औरत',         sampleIpa: 'ˈɔːrət̪',          sampleVx: 'ˈɔːrət̪' },
  'ɔ̃ː': { ipa: 'ɔ̃ː', vx: 'ɔ̃ː',   sampleWord: 'भौं',         sampleIpa: 'ˈbʰɔ̃ː',           sampleVx: 'ˈbʰɔ̃ː' },
  'p':   { ipa: 'p',   vx: 'p',     sampleWord: 'पंजाब',       sampleIpa: 'pənˈdʒaːb',        sampleVx: 'pənˈdʒaːb' },
  'r':   { ipa: 'r',   vx: 'ɹ',     sampleWord: 'रोक',         sampleIpa: 'ˈroːk',            sampleVx: 'ˈroːk' },
  'ɽ':   { ipa: 'ɽ',   vx: 'ɽ',     sampleWord: 'कूड़ा',        sampleIpa: 'ˈkuːɽaː',          sampleVx: 'ˈkuːɽaː' },
  's':   { ipa: 's',   vx: 's',     sampleWord: 'किस्मत',      sampleIpa: 'ˈkɪsmət̪',         sampleVx: 'ˈkɪsmət̪' },
  'ʃ':   { ipa: 'ʃ',   vx: 'ʃ',     sampleWord: 'ख़ुश | भाषा', sampleIpa: 'ˈkʰʊʃ | ˈbʰaːʃaː', sampleVx: 'ˈkʰʊʃ | ˈbʰaːʃaː' },
  't̪':  { ipa: 't̪',  vx: 't̪',    sampleWord: 'तबला',        sampleIpa: 'ˈt̪əblaː',         sampleVx: 'ˈt̪əblaː' },
  't̪ʰ': { ipa: 't̪ʰ', vx: 't̪ʰ',   sampleWord: 'थाली',        sampleIpa: 'ˈt̪ʰaːlɪː',        sampleVx: 'ˈt̪ʰaːlɪː' },
  'ʧ':   { ipa: 'ʧ',   vx: 'ʧ',     sampleWord: 'चाय',         sampleIpa: 'ˈʧaːeː',           sampleVx: 'ˈʧaːeː' },
  'ʧʰ':  { ipa: 'ʧʰ',  vx: 'ʧʰ',    sampleWord: 'छांव',        sampleIpa: 'ˈʧʰãːoː',         sampleVx: 'ˈʧʰãːoː' },
  'ʈ':   { ipa: 'ʈ',   vx: 'ʈ',     sampleWord: 'टमाटर',       sampleIpa: 'ʈəˈmaːʈər',        sampleVx: 'ʈəˈmaːʈər' },
  'ʈʰ':  { ipa: 'ʈʰ',  vx: 'ʈʰ',    sampleWord: 'अठारह',       sampleIpa: 'əˈʈʰaːrəh',        sampleVx: 'əˈʈʰaːrəh' },
  'uː':  { ipa: 'uː',  vx: 'uː',    sampleWord: 'कबूतर',       sampleIpa: 'kəˈbuːt̪ər',       sampleVx: 'kəˈbuːt̪ər' },
  'ũː':  { ipa: 'ũː',  vx: 'ũː', sampleWord: 'ऊंट',         sampleIpa: 'ˈũːʈ',            sampleVx: 'ˈũːʈ' },
  'ʊ':   { ipa: 'ʊ',   vx: 'ʊ',     sampleWord: 'पुत्र',       sampleIpa: 'ˈpʊt̪r',           sampleVx: 'ˈpʊt̪r' },
  'ʊ̃':  { ipa: 'ʊ̃',  vx: 'ʊ̃',    sampleWord: 'मुंह',        sampleIpa: 'ˈmʊ̃h',            sampleVx: 'ˈmʊ̃h' },
  'ʋ':   { ipa: 'ʋ',   vx: 'ʋ',     sampleWord: 'व्रत',        sampleIpa: 'ˈʋrət̪',           sampleVx: 'ˈʋrət̪' },
  'z':   { ipa: 'z',   vx: 'z',     sampleWord: 'ज़हर',        sampleIpa: 'ˈzɛːhɛːr',         sampleVx: 'ˈzɛːhɛːr' },
} as const;

/**
 * Original mapping and examples pulled from
 * https://cloud.google.com/text-to-speech/docs/phonemes.
 */
// prettier-ignore
const KOREAN_BY_IPA = {
  'p':   { ipa: 'p',   vx: 'p',   sampleWord: '불',   sampleIpa: 'pul',    sampleVx: 'pul' },
  'pʰ':  { ipa: 'pʰ',  vx: 'pʰ',  sampleWord: '풀',   sampleIpa: 'pʰul',   sampleVx: 'pʰul' },
  'p͈':   { ipa: 'p͈',   vx: 'p͈',   sampleWord: '뿔',   sampleIpa: 'p͈ul',    sampleVx: 'p͈ul' },
  't':   { ipa: 't',   vx: 't',   sampleWord: '달',   sampleIpa: 'tal',    sampleVx: 'tal' },
  'tʰ':  { ipa: 'tʰ',  vx: 'tʰ',  sampleWord: '탈',   sampleIpa: 'tʰal',   sampleVx: 'tʰal' },
  't͈':   { ipa: 't͈',   vx: 't͈',   sampleWord: '딸',   sampleIpa: 't͈al',    sampleVx: 't͈al' },
  'k':   { ipa: 'k',   vx: 'k',   sampleWord: '가다',  sampleIpa: 'kata',   sampleVx: 'kata' },
  'kʰ':  { ipa: 'kʰ',  vx: 'kʰ',  sampleWord: '칼',   sampleIpa: 'kʰal',   sampleVx: 'kʰal' },
  'k͈':   { ipa: 'k͈',   vx: 'k͈',   sampleWord: '까다',  sampleIpa: 'k͈ata',   sampleVx: 'k͈ata' },
  'sʰ':  { ipa: 'sʰ',  vx: 'sʰ',  sampleWord: '살',   sampleIpa: 'sʰal',   sampleVx: 'sʰal' },
  's͈':   { ipa: 's͈',   vx: 's͈',   sampleWord: '쌀',   sampleIpa: 's͈al',    sampleVx: 's͈al' },
  'h':   { ipa: 'h',   vx: 'h',   sampleWord: '하다',  sampleIpa: 'hata',   sampleVx: 'hata' },
  'tɕ':  { ipa: 'tɕ',  vx: 'tɕ',  sampleWord: '자다',  sampleIpa: 'tɕata',  sampleVx: 'tɕata' },
  'tɕʰ': { ipa: 'tɕʰ', vx: 'tɕʰ', sampleWord: '차다',  sampleIpa: 'tɕʰata', sampleVx: 'tɕʰata' },
  't͈ɕ':  { ipa: 't͈ɕ',  vx: 't͈ɕ',  sampleWord: '짜다',  sampleIpa: 't͈ɕata',  sampleVx: 't͈ɕata' },
  'm':   { ipa: 'm',   vx: 'm',   sampleWord: '물',   sampleIpa: 'mul',     sampleVx: 'mul' },
  'n':   { ipa: 'n',   vx: 'n',   sampleWord: '날',   sampleIpa: 'nal',     sampleVx: 'nal' },
  'ŋ':   { ipa: 'ŋ',   vx: 'ŋ',   sampleWord: '방',   sampleIpa: 'paŋ',     sampleVx: 'paŋ' },
  'ɾ':   { ipa: 'ɾ',   vx: 'ɾ',   sampleWord: '바람',  sampleIpa: 'paɾam',   sampleVx: 'paɾam' },
  'l':   { ipa: 'l',   vx: 'l',   sampleWord: '스쿨',  sampleIpa: 'sʰɯkʰul', sampleVx: 'sʰɯkʰul' },
  'w':   { ipa: 'w',   vx: 'w',   sampleWord: '문화',  sampleIpa: 'munhwa',  sampleVx: 'munhwa' },
  'j':   { ipa: 'j',   vx: 'j',   sampleWord: '양명',  sampleIpa: 'jaŋmjʌŋ', sampleVx: 'jaŋmjʌŋ' },
  'i':   { ipa: 'i',   vx: 'i',   sampleWord: '시장',  sampleIpa: 'sʰitɕaŋ', sampleVx: 'sʰitɕaŋ' },
  'a':   { ipa: 'a',   vx: 'a',   sampleWord: '말',   sampleIpa: 'mal',     sampleVx: 'mal' },
  'e':   { ipa: 'e',   vx: 'e',   sampleWord: '베개',  sampleIpa: 'pekɛ',    sampleVx: 'pekɛ' },
  'ɯ':   { ipa: 'ɯ',   vx: 'ɯ',   sampleWord: '음악',  sampleIpa: 'ɯmak',    sampleVx: 'ɯmak' },
  'ʌ':   { ipa: 'ʌ',   vx: 'ʌ',   sampleWord: '어머니', sampleIpa: 'ʌmʌni',   sampleVx: 'ʌmʌni' },
  'u':   { ipa: 'u',   vx: 'u',   sampleWord: '우리',  sampleIpa: 'uɾi',     sampleVx: 'uɾi' },
  'o':   { ipa: 'o',   vx: 'o',   sampleWord: '오리',  sampleIpa: 'oɾi',     sampleVx: 'oɾi' },
  'ø':   { ipa: 'ø',   vx: 'ø',   sampleWord: '교회',  sampleIpa: 'kjohø',   sampleVx: 'kjohø' },
  'ɛ':   { ipa: 'ɛ',   vx: 'ɛ',   sampleWord: '태양',  sampleIpa: 'tʰɛjaŋ',  sampleVx: 'tʰɛjaŋ' },
} as const;

/**
 * Original mapping and examples pulled from
 * https://cloud.google.com/text-to-speech/docs/phonemes.
 */
// prettier-ignore
const TAGALOG_BY_IPA = {
  'a':  { ipa: 'a',  vx: 'a',  sampleWord: 'aso',       sampleIpa: 'ˈʔasʊ',     sampleVx: 'ˈʔasʊ' },
  'ai': { ipa: 'ai', vx: 'ai', sampleWord: 'bahay',     sampleIpa: 'ˈbahai',    sampleVx: 'ˈbahai' },
  'au': { ipa: 'au', vx: 'au', sampleWord: 'galaw',     sampleIpa: 'gaˈlau',    sampleVx: 'gaˈlau' },
  'b':  { ipa: 'b',  vx: 'b',  sampleWord: 'buto',      sampleIpa: 'ˈbʊtʊ',     sampleVx: 'ˈbʊtʊ' },
  'd':  { ipa: 'd',  vx: 'd',  sampleWord: 'adya',      sampleIpa: 'ʔadˈjaʔ',   sampleVx: 'ʔadˈjaʔ' },
  'dʒ': { ipa: 'dʒ', vx: 'dʒ', sampleWord: 'Diego',     sampleIpa: 'ˈdʒɛgo',    sampleVx: 'ˈdʒɛgo' },
  'ɛ':  { ipa: 'ɛ',  vx: 'ɛ',  sampleWord: 'ewan',      sampleIpa: 'ˈʔɛwan',    sampleVx: 'ˈʔɛwan' },
  'g':  { ipa: 'g',  vx: 'g',  sampleWord: 'gata',      sampleIpa: 'gaˈtaʔ',    sampleVx: 'gaˈtaʔ' },
  'h':  { ipa: 'h',  vx: 'h',  sampleWord: 'haba',      sampleIpa: 'ˈhabaʔ',    sampleVx: 'ˈhabaʔ' },
  'i':  { ipa: 'i',  vx: 'i',  sampleWord: 'iwan',      sampleIpa: 'ˈʔiwan',    sampleVx: 'ˈʔiwan' },
  'iu': { ipa: 'iu', vx: 'iu', sampleWord: 'baliw',     sampleIpa: 'baˈliu',    sampleVx: 'baˈliu' },
  'j':  { ipa: 'j',  vx: 'j',  sampleWord: 'yanig',     sampleIpa: 'ˈjanig',    sampleVx: 'ˈjanig' },
  'k':  { ipa: 'k',  vx: 'k',  sampleWord: 'kapit',     sampleIpa: 'ˈkapit',    sampleVx: 'ˈkapit' },
  'l':  { ipa: 'l',  vx: 'l',  sampleWord: 'lamay',     sampleIpa: 'ˈlamai',    sampleVx: 'ˈlamai' },
  'm':  { ipa: 'm',  vx: 'm',  sampleWord: 'mata',      sampleIpa: 'maˈta',     sampleVx: 'maˈta' },
  'n':  { ipa: 'n',  vx: 'n',  sampleWord: 'niya',      sampleIpa: 'niˈja',     sampleVx: 'niˈja' },
  'ɲ':  { ipa: 'ɲ',  vx: 'ɲ',  sampleWord: 'kolonya',   sampleIpa: 'koˈloɲa',   sampleVx: 'koˈloɲa' },
  'ŋ':  { ipa: 'ŋ',  vx: 'ŋ',  sampleWord: 'ngipin',    sampleIpa: 'ˈŋipin',    sampleVx: 'ˈŋipin' },
  'o':  { ipa: 'o',  vx: 'o',  sampleWord: 'oyayi',     sampleIpa: 'ʔoˈjaji',   sampleVx: 'ʔoˈjaji' },
  'p':  { ipa: 'p',  vx: 'p',  sampleWord: 'pito',      sampleIpa: 'ˈpitʊ',     sampleVx: 'ˈpitʊ' },
  'ɾ':  { ipa: 'ɾ',  vx: 'ɾ',  sampleWord: 'rurok',     sampleIpa: 'ˈɾʊɾʊk',    sampleVx: 'ˈɾʊɾʊk' },
  's':  { ipa: 's',  vx: 's',  sampleWord: 'siyam',     sampleIpa: 'siˈjam',    sampleVx: 'siˈjam' },
  'ʃ':  { ipa: 'ʃ',  vx: 'ʃ',  sampleWord: 'konsensya', sampleIpa: 'konˈsɛnʃa', sampleVx: 'konˈsɛnʃa' },
  't':  { ipa: 't',  vx: 't',  sampleWord: 'tiyan',     sampleIpa: 'tiˈjan',    sampleVx: 'tiˈjan' },
  'ʧ':  { ipa: 'ʧ',  vx: 'ʧ',  sampleWord: 'tsaka',     sampleIpa: 'tʃaˈka',    sampleVx: 'tʃaˈka' },
  'ʊ':  { ipa: 'ʊ',  vx: 'ʊ',  sampleWord: 'upuan',     sampleIpa: 'ʔʊpʊˈʔan',  sampleVx: 'ʔʊpʊˈʔan' },
  'ui': { ipa: 'ui', vx: 'ui', sampleWord: 'abuloy',    sampleIpa: 'ʔaˈbʊlui',  sampleVx: 'ʔaˈbʊlui' },
  'w':  { ipa: 'w',  vx: 'w',  sampleWord: 'wala',      sampleIpa: 'waˈlaʔ',    sampleVx: 'waˈlaʔ' },
  'ʔ':  { ipa: 'ʔ',  vx: 'ʔ',  sampleWord: 'ilaw',      sampleIpa: 'ˈʔilau',    sampleVx: 'ˈʔilau' },
} as const;

/**
 * Represents a phonetic sound in IPA format. Used for speech synthesis via the
 * Google Cloud Text-To-Speech API.
 *
 * @see https://cloud.google.com/text-to-speech/docs/phonemes
 */
export type IpaPhoneme =
  | keyof typeof ENGLISH_BY_IPA
  | keyof typeof HINDI_BY_IPA
  | keyof typeof KOREAN_BY_IPA
  | keyof typeof SPANISH_BY_IPA
  | keyof typeof TAGALOG_BY_IPA;

const IPA_PHONEMES = new Set([
  ...(Object.keys(ENGLISH_BY_IPA) as IpaPhoneme[]),
  ...(Object.keys(HINDI_BY_IPA) as IpaPhoneme[]),
  ...(Object.keys(KOREAN_BY_IPA) as IpaPhoneme[]),
  ...(Object.keys(SPANISH_BY_IPA) as IpaPhoneme[]),
  ...(Object.keys(TAGALOG_BY_IPA) as IpaPhoneme[]),
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
   * Trailing consonant modifier sound used for phoneme sound previews in the
   * phonetic editor keyboard. Consonants cannot be synthesized on their own, so
   * this enables synthesis and can be overridden per language to provide a more
   * natural consonant sound for that language.
   *
   * For example, the schwa (`ə`) is appropriate for English and some other
   * languages, but isn't a valid sound in all languages.
   */
  consonantModifier: IpaPhoneme;

  /** `true` if stresses are not applicable for the language. */
  // [TODO] Clean up.
  noStress?: boolean;

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

  /**
   * Leading modifier for vowels. Used in the phonetic editor keyboard for
   * phoneme sound previews. Vowels in some languages sound odd on their own
   * without, for example, a glottal stop (`ʔ`) before the vowel for emphasis.
   *
   * [TODO] We may need to distinguish between leading and trailing modifiers,
   * if some languages require the latter.
   */
  vowelModifier?: IpaPhoneme;
}

export const PhoneticSyllableStressSchema = z.enum(['primary', 'secondary']);

export type PhoneticSyllableStress = z.infer<
  typeof PhoneticSyllableStressSchema
>;

const STANDARD_STRESSES: TtsPhonemes['stresses'] = {
  primary: { ipa: 'ˈ', vx: 'ˈ' },
  secondary: { ipa: 'ˌ', vx: 'ˌ' },
};

const ALL_ENGLISH = Object.values(ENGLISH_BY_IPA);
const ALL_SPANISH = Object.values(SPANISH_BY_IPA);
const ALL_HINDI = Object.values(HINDI_BY_IPA);
const ALL_KOREAN = Object.values(KOREAN_BY_IPA);
const ALL_TAGALOG = Object.values(TAGALOG_BY_IPA);

export const DEFAULT_CONSONANT_MODIFIER = 'ə';

/**
 * Language-specific phonemes for speech synthesis.
 * [TODO] Actually configure phonemes for the non-English languages.
 */
export const phonemes: Record<LanguageCode, TtsPhonemes> = {
  [LanguageCode.ENGLISH]: {
    allByIpa: ENGLISH_BY_IPA,
    consonants: ALL_ENGLISH.filter((p) => !ALL_VOWELS.has(p.ipa)),
    consonantModifier: DEFAULT_CONSONANT_MODIFIER,
    stresses: STANDARD_STRESSES,
    vowels: ALL_ENGLISH.filter((p) => ALL_VOWELS.has(p.ipa)),
  },
  [LanguageCode.ARABIC]: {
    allByIpa: ENGLISH_BY_IPA,
    consonants: ALL_ENGLISH.filter((p) => !ALL_VOWELS.has(p.ipa)),
    consonantModifier: DEFAULT_CONSONANT_MODIFIER,
    stresses: STANDARD_STRESSES,
    vowels: ALL_ENGLISH.filter((p) => ALL_VOWELS.has(p.ipa)),
  },
  [LanguageCode.BENGALI]: {
    allByIpa: ENGLISH_BY_IPA,
    consonants: ALL_ENGLISH.filter((p) => !ALL_VOWELS.has(p.ipa)),
    consonantModifier: DEFAULT_CONSONANT_MODIFIER,
    stresses: STANDARD_STRESSES,
    vowels: ALL_ENGLISH.filter((p) => ALL_VOWELS.has(p.ipa)),
  },
  [LanguageCode.CHINESE_SIMPLIFIED]: {
    allByIpa: ENGLISH_BY_IPA,
    consonants: ALL_ENGLISH.filter((p) => !ALL_VOWELS.has(p.ipa)),
    consonantModifier: DEFAULT_CONSONANT_MODIFIER,
    stresses: STANDARD_STRESSES,
    vowels: ALL_ENGLISH.filter((p) => ALL_VOWELS.has(p.ipa)),
  },
  [LanguageCode.CHINESE_TRADITIONAL]: {
    allByIpa: ENGLISH_BY_IPA,
    consonants: ALL_ENGLISH.filter((p) => !ALL_VOWELS.has(p.ipa)),
    consonantModifier: DEFAULT_CONSONANT_MODIFIER,
    stresses: STANDARD_STRESSES,
    vowels: ALL_ENGLISH.filter((p) => ALL_VOWELS.has(p.ipa)),
  },
  [LanguageCode.HINDI]: {
    allByIpa: HINDI_BY_IPA,
    consonants: ALL_HINDI.filter((p) => !ALL_VOWELS.has(p.ipa)),
    consonantModifier: DEFAULT_CONSONANT_MODIFIER,
    stresses: STANDARD_STRESSES,
    vowels: ALL_HINDI.filter((p) => ALL_VOWELS.has(p.ipa)),
  },
  [LanguageCode.JAPANESE]: {
    allByIpa: ENGLISH_BY_IPA,
    consonants: ALL_ENGLISH.filter((p) => !ALL_VOWELS.has(p.ipa)),
    consonantModifier: DEFAULT_CONSONANT_MODIFIER,
    stresses: STANDARD_STRESSES,
    vowels: ALL_ENGLISH.filter((p) => ALL_VOWELS.has(p.ipa)),
  },
  [LanguageCode.KHMER]: {
    allByIpa: ENGLISH_BY_IPA,
    consonants: ALL_ENGLISH.filter((p) => !ALL_VOWELS.has(p.ipa)),
    consonantModifier: DEFAULT_CONSONANT_MODIFIER,
    stresses: STANDARD_STRESSES,
    vowels: ALL_ENGLISH.filter((p) => ALL_VOWELS.has(p.ipa)),
  },
  [LanguageCode.KOREAN]: {
    allByIpa: KOREAN_BY_IPA,
    consonants: ALL_KOREAN.filter((p) => !ALL_VOWELS.has(p.ipa)),
    consonantModifier: 'ɯ',
    noStress: true,
    stresses: {
      primary: { ipa: '.', vx: '.' },
      secondary: { ipa: '.', vx: '.' },
    },
    vowels: ALL_KOREAN.filter((p) => ALL_VOWELS.has(p.ipa)),
  },
  [LanguageCode.SPANISH]: {
    allByIpa: SPANISH_BY_IPA,
    consonants: ALL_SPANISH.filter((p) => !ALL_VOWELS.has(p.ipa)),
    consonantModifier: DEFAULT_CONSONANT_MODIFIER,
    stresses: STANDARD_STRESSES,
    vowels: ALL_SPANISH.filter((p) => ALL_VOWELS.has(p.ipa)),
  },
  [LanguageCode.TAGALOG]: {
    allByIpa: TAGALOG_BY_IPA,
    consonants: ALL_TAGALOG.filter((p) => !ALL_VOWELS.has(p.ipa)),
    consonantModifier: 'a',
    stresses: STANDARD_STRESSES,
    vowels: ALL_TAGALOG.filter((p) => ALL_VOWELS.has(p.ipa)),
    vowelModifier: 'ʔ',
  },
  [LanguageCode.VIETNAMESE]: {
    allByIpa: ENGLISH_BY_IPA,
    consonants: ALL_ENGLISH.filter((p) => !ALL_VOWELS.has(p.ipa)),
    consonantModifier: DEFAULT_CONSONANT_MODIFIER,
    stresses: STANDARD_STRESSES,
    vowels: ALL_ENGLISH.filter((p) => ALL_VOWELS.has(p.ipa)),
  },
};

export function isVowel(p: IpaPhoneme): boolean {
  return ALL_VOWELS.has(p);
}

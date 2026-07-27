import { assert } from '@votingworks/basics';
import { BallotStyle, LanguageCode } from '@votingworks/types';
import { ORDERED_LANGUAGES } from '@votingworks/utils';
import { customAlphabet } from 'nanoid';
import useSoundLib from 'use-sound';

/**
 * The languages available for viewing the ballot styles in a CA template
 * ballot style group. The CA template generates a separate ballot style per
 * language, with non-English ballots rendered bilingually (English alongside
 * the translated language), so the English-only variant is omitted whenever
 * translated variants exist.
 */
export function caBallotStyleLanguages(
  groupBallotStyles: ReadonlyArray<Pick<BallotStyle, 'languages'>>
): LanguageCode[] {
  const languages = ORDERED_LANGUAGES.filter((language) =>
    groupBallotStyles.some((ballotStyle) =>
      ballotStyle.languages.includes(language)
    )
  );
  const translatedLanguages = languages.filter(
    (language) => language !== LanguageCode.ENGLISH
  );
  return translatedLanguages.length > 0 ? translatedLanguages : languages;
}

const idGenerator = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

/**
 * Generates a URL-friendly and double-click-copy-friendly unique ID using a
 * cryptographically secure RNG.
 */
export function generateId(): string {
  return idGenerator();
}

/**
 * Returns a copy of the given array with the value at the specified index
 * replaced with the given value.
 */
export function replaceAtIndex<T>(
  array: readonly T[],
  index: number,
  newValue: T
): T[] {
  return array.map((value, i) => (i === index ? newValue : value));
}

/**
 * Downloads a file given a file path
 */
export function downloadFile(filePath: string, fileName?: string): void {
  const element = document.createElement('a');
  element.setAttribute('href', filePath);
  element.setAttribute('download', fileName ?? '');
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

/**
 * Returns a copy of the given array with the element at fromIndex
 * moved to toIndex.
 */
export function reorderElement<T>(
  array: readonly T[],
  fromIndex: number,
  toIndex: number
): T[] {
  assert(fromIndex >= 0 && fromIndex < array.length);
  assert(toIndex >= 0 && toIndex < array.length);
  const result = [...array];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

export type SoundType = 'happy-ping';

export function useSound(sound: SoundType): () => void {
  const [playSound] = useSoundLib(`/sounds/${sound}.mp3`);
  return playSound;
}

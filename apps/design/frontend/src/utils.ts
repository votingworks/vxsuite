import { assert } from '@votingworks/basics';
import { customAlphabet } from 'nanoid';
import useSoundLib from 'use-sound';

const idGenerator = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

/**
 * Generates a URL-friendly and double-click-copy-friendly unique ID using a
 * cryptographically secure RNG.
 */
export function generateId(): string {
  return idGenerator();
}

/**
 * Multi-line contest titles are stored with `<br/>` line breaks (which the
 * ballot renderer supports). Converts a stored title to plain text with
 * newlines for editing and display.
 */
export function contestTitleToPlainText(title: string): string {
  return title.replace(/<br\s*\/?>/gi, '\n');
}

/**
 * Converts plain text with newlines to a stored contest title with `<br/>`
 * line breaks, trimming each line and dropping leading/trailing blank lines.
 */
export function plainTextToContestTitle(text: string): string {
  const lines = text.split('\n').map((line) => line.trim());
  while (lines.length > 0 && lines[0] === '') {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.join('<br/>');
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

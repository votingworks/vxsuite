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

export const ALL_PRECINCTS_REPORT_KEY = '';

export type SoundType = 'happy-ping';

export function useSound(sound: SoundType): () => void {
  const [playSound] = useSoundLib(`/sounds/${sound}.mp3`);
  return playSound;
}

// Find the last text node in a given root node
function findLastTextNode(root: Node): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  while (walker.nextNode()) last = walker.currentNode as Text;
  return last;
}

// Remove trailing NBSPs and any trailing whitespace, if there is at least one nbsp (unicode U+00A0)
function stripTrailingNbsp(text: string): string {
  return text.replace(/[\u00A0\s]+$/, '');
}

// HTML_BLOCKS includes the HTML elements that most commonly have unintended trailing
// non-breaking spaces when pasting content from external sources
const HTML_BLOCKS = ['p', 'li', 'td', 'th'] as const;
export function sanitizeTrailingNbspOnPaste(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.body.querySelectorAll(HTML_BLOCKS.join(',')).forEach((block) => {
    const lastText = findLastTextNode(block);
    if (lastText?.nodeValue) {
      lastText.nodeValue = stripTrailingNbsp(lastText.nodeValue);
    }
  });

  return doc.body.innerHTML;
}

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

export type SoundType = 'happy-ping';

export function useSound(sound: SoundType): () => void {
  const [playSound] = useSoundLib(`/sounds/${sound}.mp3`);
  return playSound;
}

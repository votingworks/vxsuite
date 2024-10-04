import useSoundLib from 'use-sound';

export function useSound(
  sound: 'success' | 'warning' | 'error' | 'alarm'
): () => void {
  const [playSound] = useSoundLib(`/sounds/${sound}.mp3`);
  return playSound;
}

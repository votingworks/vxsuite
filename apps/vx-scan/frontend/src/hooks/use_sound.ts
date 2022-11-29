import { useContext } from 'react';
import useSoundLib from 'use-sound';
import { AppContext } from '../contexts/app_context';

export function useSound(sound: 'success' | 'warning' | 'error'): () => void {
  const [playSound] = useSoundLib(`/sounds/${sound}.mp3`);
  const { isSoundMuted } = useContext(AppContext);
  if (isSoundMuted) {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    return () => {};
  }
  return playSound;
}

// @coverage-defer-file
import useSoundLib from 'use-sound';

export interface SoundOptions {
  volume?: number;
}

export type SoundType = 'success' | 'warning' | 'error' | 'alarm';

export function useSoundControls(
  sound: SoundType,
  opts: SoundOptions = {}
): {
  play: () => void;
  stop: () => void;
} {
  const [playSound, controls] = useSoundLib(`/sounds/${sound}.mp3`, opts);

  return {
    play: playSound,
    stop: controls.stop,
  };
}

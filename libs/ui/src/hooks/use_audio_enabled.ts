import { useAudioContext } from '../ui_strings/audio_context.js';

export function useAudioEnabled(): boolean {
  return useAudioContext()?.isEnabled || false;
}

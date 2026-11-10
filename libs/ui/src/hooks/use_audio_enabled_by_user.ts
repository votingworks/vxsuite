import { useAudioContext } from '../ui_strings/audio_context.js';

export function useAudioEnabledByUser(): boolean {
  return useAudioContext()?.isEnabledByUser || false;
}

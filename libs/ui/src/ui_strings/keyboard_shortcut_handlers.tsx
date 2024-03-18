import React from 'react';
import { useCurrentLanguage } from '../hooks/use_current_language';
import { useAvailableLanguages } from '../hooks/use_available_languages';
import { useLanguageControls } from '../hooks/use_language_controls';
import { useAudioControls } from '../hooks/use_audio_controls';

export enum ACCESSIBILITY_KEYBINDINGS {
  TOGGLE_AUDIO = 'M',
  REPLAY = 'R',
  DECREASE_PLAYBACK_RATE = ',',
  INCREASE_PLAYBACK_RATE = '.',
  TOGGLE_PAUSE = 'P',
  DECREASE_VOLUME = '-',
  INCREASE_VOLUME = '=',
}

/**
 * Installs UI String keyboard shortcuts for dev convenience.
 *   - Shift+L: Switch to next available display/audio language.
 */
export function KeyboardShortcutHandlers(): React.ReactNode {
  const currentLanguageCode = useCurrentLanguage();
  const availableLanguages = useAvailableLanguages();
  const { setLanguage } = useLanguageControls();
  const audioControls = useAudioControls();

  React.useEffect(() => {
    function onKeyPress(event: KeyboardEvent) {
      switch (event.key) {
        case 'L': {
          const currentLanguageIndex = availableLanguages.findIndex(
            (l) => l === currentLanguageCode
          );
          const nextIndex =
            (currentLanguageIndex + 1) % availableLanguages.length;

          setLanguage(availableLanguages[nextIndex]);
          break;
        }
        case ACCESSIBILITY_KEYBINDINGS.TOGGLE_AUDIO:
          audioControls.toggleEnabled();
          break;
        case ACCESSIBILITY_KEYBINDINGS.REPLAY:
          audioControls.replay();
          break;
        case ACCESSIBILITY_KEYBINDINGS.DECREASE_PLAYBACK_RATE:
          audioControls.decreasePlaybackRate();
          break;
        case ACCESSIBILITY_KEYBINDINGS.INCREASE_PLAYBACK_RATE:
          audioControls.increasePlaybackRate();
          break;
        case ACCESSIBILITY_KEYBINDINGS.TOGGLE_PAUSE:
          audioControls.togglePause();
          break;
        case ACCESSIBILITY_KEYBINDINGS.DECREASE_VOLUME:
          audioControls.decreaseVolume();
          break;
        case ACCESSIBILITY_KEYBINDINGS.INCREASE_VOLUME:
          audioControls.increaseVolume();
          break;
        default:
        // No op
      }
    }

    document.addEventListener('keydown', onKeyPress);

    return () => document.removeEventListener('keydown', onKeyPress);
  }, [availableLanguages, currentLanguageCode, setLanguage, audioControls]);

  return null;
}

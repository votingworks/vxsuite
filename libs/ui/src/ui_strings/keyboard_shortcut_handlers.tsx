import React from 'react';
import { useCurrentLanguage } from '../hooks/use_current_language';
import { useAvailableLanguages } from '../hooks/use_available_languages';
import { useLanguageControls } from '../hooks/use_language_controls';
import { useAudioControls } from '../hooks/use_audio_controls';

export type AccessibilityCommands =
  | 'toggle-audio'
  | 'replay'
  | 'decrease-playback-rate'
  | 'increase-playback-rate'
  | 'toggle-pause'
  | 'decrease-volume'
  | 'increase-volume';

export const ACCESSIBILITY_COMMAND_KEYS: Record<AccessibilityCommands, string> =
  {
    'toggle-audio': 'M',
    replay: 'R',
    'decrease-playback-rate': ',',
    'increase-playback-rate': '.',
    'toggle-pause': 'P',
    'decrease-volume': '-',
    'increase-volume': '=',
  };

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
        case ACCESSIBILITY_COMMAND_KEYS['toggle-audio']:
          audioControls.toggleEnabled();
          break;
        case ACCESSIBILITY_COMMAND_KEYS['replay']:
          audioControls.replay();
          break;
        case ACCESSIBILITY_COMMAND_KEYS['decrease-playback-rate']:
          audioControls.decreasePlaybackRate();
          break;
        case ACCESSIBILITY_COMMAND_KEYS['increase-playback-rate']:
          audioControls.increasePlaybackRate();
          break;
        case ACCESSIBILITY_COMMAND_KEYS['toggle-pause']:
          audioControls.togglePause();
          break;
        case ACCESSIBILITY_COMMAND_KEYS['decrease-volume']:
          audioControls.decreaseVolume();
          break;
        case ACCESSIBILITY_COMMAND_KEYS['increase-volume']:
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

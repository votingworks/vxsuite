import React from 'react';
import { useCurrentLanguage } from '../hooks/use_current_language.js';
import { useAvailableLanguages } from '../hooks/use_available_languages.js';
import { useLanguageControls } from '../hooks/use_language_controls.js';
import { useAudioControls } from '../hooks/use_audio_controls.js';
import { useKeybindings } from '../keybindings_context.js';

/**
 * Installs UI String keyboard shortcuts for dev convenience.
 */
export function KeyboardShortcutHandlers(): React.ReactNode {
  const currentLanguageCode = useCurrentLanguage();
  const availableLanguages = useAvailableLanguages();
  const { setLanguage } = useLanguageControls();
  const audioControls = useAudioControls();
  const keybindings = useKeybindings();

  React.useEffect(() => {
    function onKeyPress(event: KeyboardEvent) {
      /* @coverage-exclude: testing-library's keyboard simulation
         doesn't property set the `repeat` field for repeated events */
      // VVSG 2.0 7.2-M – No repetitive activation
      if (event.repeat) return;

      switch (event.key) {
        case keybindings.SWITCH_LANGUAGE: {
          const currentLanguageIndex = availableLanguages.findIndex(
            (l) => l === currentLanguageCode
          );
          const nextIndex =
            (currentLanguageIndex + 1) % availableLanguages.length;

          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          setLanguage(availableLanguages[nextIndex]!);
          break;
        }
        case keybindings.TOGGLE_AUDIO:
          audioControls.toggleEnabled();
          break;
        case keybindings.PLAYBACK_RATE_DOWN:
          audioControls.decreasePlaybackRate();
          break;
        case keybindings.PLAYBACK_RATE_UP:
          audioControls.increasePlaybackRate();
          break;
        case keybindings.TOGGLE_PAUSE:
          audioControls.togglePause();
          break;
        case keybindings.VOLUME_CYCLE:
          audioControls.cycleVolume();
          break;
        case keybindings.VOLUME_DOWN:
          audioControls.decreaseVolume();
          break;
        case keybindings.VOLUME_UP:
          audioControls.increaseVolume();
          break;
        default:
        // No op
      }
    }

    document.addEventListener('keydown', onKeyPress);

    return () => document.removeEventListener('keydown', onKeyPress);
  }, [
    availableLanguages,
    currentLanguageCode,
    setLanguage,
    audioControls,
    keybindings,
  ]);

  return null;
}

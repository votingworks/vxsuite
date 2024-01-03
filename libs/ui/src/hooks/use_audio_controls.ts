import { useAudioContext } from '../ui_strings/audio_context';

export interface AudioControls {
  decreasePlaybackRate: () => void;
  decreaseVolume: () => void;
  increasePlaybackRate: () => void;
  increaseVolume: () => void;
  replay: () => void;
  reset: () => void;
  setIsEnabled: (enabled: boolean) => void;
  togglePause: () => void;
}

function noOp() {}

/**
 * Replays the current or last-played audio by re-triggering a focus event on
 * the currently active element, if any.
 */
function replay() {
  const { activeElement } = window.document;

  if (activeElement instanceof HTMLElement) {
    activeElement.blur();
    activeElement.focus();
  }
}

/**
 * Provides an API for modifying UiString screen reader audio settings.
 *
 * Returns a stubbed-out no-op API for convenience/ease-of-testing, when used
 * without a parent `UiStringsAudioContext`.
 */
export function useAudioControls(): AudioControls {
  const audioContext = useAudioContext();

  return {
    decreasePlaybackRate: audioContext?.decreasePlaybackRate || noOp,
    decreaseVolume: audioContext?.decreaseVolume || noOp,
    increasePlaybackRate: audioContext?.increasePlaybackRate || noOp,
    increaseVolume: audioContext?.increaseVolume || noOp,
    reset: audioContext?.reset || noOp,
    replay,
    setIsEnabled: audioContext?.setIsEnabled || noOp,
    togglePause: audioContext?.togglePause || noOp,
  };
}

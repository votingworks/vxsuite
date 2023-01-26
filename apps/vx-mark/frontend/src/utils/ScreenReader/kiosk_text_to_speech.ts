import { assert } from '@votingworks/basics';
import { SpeakOptions, TextToSpeech } from '../../config/types';

// Default volume, range, and increment are
export const MAX_KIOSK_VOLUME = 100;
export const MIN_KIOSK_VOLUME = 28;
export const MAX_VOLUME_INCREMENT = 10;
export const MIN_VOLUME_INCREMENT = 1;
export const INITIAL_VOLUME_INCREMENT = 3;
export const VOLUME_INCREMENT_VALUE =
  (MAX_KIOSK_VOLUME - MIN_KIOSK_VOLUME) /
  (MAX_VOLUME_INCREMENT - MIN_VOLUME_INCREMENT);

export function incrementToVolume(increment: number): number {
  return (
    MIN_KIOSK_VOLUME +
    (increment - MIN_VOLUME_INCREMENT) * VOLUME_INCREMENT_VALUE
  );
}

export class KioskTextToSpeech implements TextToSpeech {
  private muted = false;
  private volumeIncrement = INITIAL_VOLUME_INCREMENT;
  private isVolumeIncreasing = true;

  constructor() {
    assert(window.kiosk, 'KioskTextToSpeech requires window.kiosk');
  }

  /**
   * Directly triggers speech of text. Resolves when speaking is finished
   * or cancelled.
   */
  async speak(text: string, { now = true }: SpeakOptions = {}): Promise<void> {
    assert(now, 'method "speak"  with "options.now = false" is not supported');
    assert(window.kiosk);

    if (this.isMuted()) {
      return;
    }

    if (now) {
      await window.kiosk.cancelSpeak();
    }

    await window.kiosk.speak(text, {
      volume: incrementToVolume(this.volumeIncrement),
    });
  }

  /**
   * Stops any speaking that is currently happening.
   */
  stop(): void {
    assert(window.kiosk);
    void window.kiosk.cancelSpeak();
  }

  /**
   * Prevents any sound from being made but otherwise functions normally.
   */
  mute(): void {
    this.stop();
    this.muted = true;
  }

  /**
   * Allows sounds to be made.
   */
  unmute(): void {
    this.muted = false;
  }

  /**
   * Checks whether this TTS is muted.
   */
  isMuted(): boolean {
    return this.muted;
  }

  /**
   * Toggles muted state, or sets it according to the argument.
   */
  toggleMuted(muted = !this.isMuted()): void {
    if (muted) {
      this.mute();
    } else {
      this.unmute();
    }
  }

  changeVolume(): void {
    // reverse volume change direction if necessary
    if (this.volumeIncrement === MAX_VOLUME_INCREMENT) {
      this.isVolumeIncreasing = false;
    } else if (this.volumeIncrement === MIN_VOLUME_INCREMENT) {
      this.isVolumeIncreasing = true;
    }

    if (this.isVolumeIncreasing) {
      this.volumeIncrement += 1;
      void this.speak(
        `Increased volume to ${this.volumeIncrement} out of ${MAX_VOLUME_INCREMENT}.`
      );
    } else {
      this.volumeIncrement -= 1;
      void this.speak(
        `Decreased volume to ${this.volumeIncrement} out of ${MAX_VOLUME_INCREMENT}.`
      );
    }
  }
}

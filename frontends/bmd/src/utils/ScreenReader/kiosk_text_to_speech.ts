import { assert } from '@votingworks/utils';
import { SpeakOptions, TextToSpeech } from '../../config/types';

export class KioskTextToSpeech implements TextToSpeech {
  private muted = false;
  private readonly volume = 50;

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

    await window.kiosk.speak(text, { volume: this.volume });
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
}

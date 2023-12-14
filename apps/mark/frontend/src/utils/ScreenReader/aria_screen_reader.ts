import { ScreenReader, SpeakOptions, TextToSpeech } from '../../config/types';

/**
 * Implements `ScreenReader` using the ARIA DOM attributes.
 */
export class AriaScreenReader implements ScreenReader {
  /**
   * @param tts A text-to-speech engine to use to speak aloud.
   */
  constructor(private readonly tts: TextToSpeech) {}

  /**
   * Enables the screen reader and announces the change. Resolves when speaking
   * is done.
   */
  async enable(): Promise<void> {
    this.unmute();
    await this.speak('Screen reader enabled', { now: true });
  }

  /**
   * Disables the screen reader and announces the change. Resolves when speaking
   * is done.
   */
  async disable(): Promise<void> {
    await this.speak('Screen reader disabled', { now: true });
    this.mute();
  }

  /**
   * Toggles the screen reader being enabled and announces the change. Resolves
   * when speaking is done.
   */
  async toggle(enabled = this.isMuted()): Promise<void> {
    if (enabled) {
      await this.enable();
    } else {
      await this.disable();
    }
  }

  /**
   * Prevents any sound from being made but otherwise functions normally.
   */
  mute(): void {
    return this.tts.mute();
  }

  /**
   * Allows sounds to be made.
   */
  unmute(): void {
    return this.tts.unmute();
  }

  /**
   * Checks whether this TTS is muted.
   */
  isMuted(): boolean {
    return this.tts.isMuted();
  }

  /**
   * Toggles muted state, or sets it according to the argument.
   */
  toggleMuted(muted?: boolean): void {
    this.tts.toggleMuted(muted);
  }

  /**
   * Directly triggers speech of text. Resolves when speaking is done.
   */
  async speak(text: string, options: SpeakOptions = {}): Promise<void> {
    /* istanbul ignore next */
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log(
        `[ScreenReader] speak(now: ${
          options.now || false
        }) (muted: ${this.isMuted()}) ${text}`
      );
    }
    await this.tts.speak(text, options);
  }
}

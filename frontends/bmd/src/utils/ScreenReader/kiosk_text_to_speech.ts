import { SpeakOptions, TextToSpeech } from '../../config/types';

interface SpeechItem {
  utterance: string;
  resolve: (value: void | PromiseLike<void>) => void;
}

export class KioskTextToSpeech implements TextToSpeech {
  private readonly speechQueue: SpeechItem[] = [];
  private isSpeaking = false;

  // Simultaneous calls to kiosk.cancelSpeak will cause duplicated spd-say
  // calls to fail. We avoid conflicts by tracking the corresponding promise.
  private promiseToStop?: Promise<void> = undefined;

  private muted = false;
  private readonly volume = 50;

  constructor(initiallyMuted: boolean) {
    this.muted = initiallyMuted;
  }
  /**
   * Queues utterance to be sent to the speech dispatcher
   */
  async speak(
    utterance: string,
    { now = false }: SpeakOptions = {}
  ): Promise<void> {
    if (this.isMuted()) {
      return;
    }

    if (now) {
      await this.stop();
    }

    await this.enqueueSpeech(utterance);
  }

  /**
   * Adds an utterance to the speaking queue
   */
  private enqueueSpeech(utterance: string): Promise<void> {
    return new Promise((resolve) => {
      this.speechQueue.push({
        utterance,
        resolve,
      });
      this.dequeueSpeech();
    });
  }

  /**
   * Tries to send the next utterance to the speech dispatcher
   */
  private dequeueSpeech(): void {
    if (this.isSpeaking) {
      return;
    }

    const speechItem = this.speechQueue.shift();
    if (!speechItem) {
      return;
    }

    if (window.kiosk) {
      this.isSpeaking = true;
      window.kiosk
        .speak(speechItem.utterance, { volume: this.volume })
        .then(() => {
          this.isSpeaking = false;
          speechItem.resolve();
          this.dequeueSpeech();
        })
        .catch(() => {
          this.isSpeaking = false;
        });
    } else {
      // Avoid hanging promises in test and dev environments
      speechItem.resolve();
      this.dequeueSpeech();
    }
  }

  /**
   * Stops any speaking that is currently happening or is queued.
   */
  async stop(): Promise<void> {
    // No need to stop if we're already muted
    if (this.isMuted()) {
      return;
    }

    // Empty speech queue and mark as "resolved" to avoid hanging promises
    while (this.speechQueue.length > 0) {
      this.speechQueue.shift()?.resolve();
    }

    if (this.promiseToStop) {
      // Wait on existing request to stop speech if it exists
      await this.promiseToStop;
    } else if (window.kiosk) {
      // Create a new request to stop speech
      this.promiseToStop = window.kiosk.cancelSpeak();
      await this.promiseToStop;
      this.promiseToStop = undefined;
    }
  }

  /**
   * Prevents any sound from being made but otherwise functions normally.
   */
  async mute(): Promise<void> {
    await this.stop();
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
  async toggleMuted(muted = !this.isMuted()): Promise<void> {
    if (muted) {
      await this.mute();
    } else {
      this.unmute();
    }
  }
}

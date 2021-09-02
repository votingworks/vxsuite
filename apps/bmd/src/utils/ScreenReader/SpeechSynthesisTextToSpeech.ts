import { SpeakOptions, TextToSpeech, VoiceSelector } from '../../config/types'

export default class SpeechSynthesisTextToSpeech implements TextToSpeech {
  private muted = false

  public constructor(private getVoice?: VoiceSelector) {
    // Prime the speech synthesis engine. This call will likely return an empty
    // array, but future ones should work properly.
    speechSynthesis.getVoices()
  }

  /**
   * Directly triggers speech of text. Resolves when speaking is done.
   */
  public async speak(
    text: string,
    { now = false }: SpeakOptions = {}
  ): Promise<void> {
    if (this.isMuted()) {
      return
    }

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text)
      const { getVoice } = this
      const voice = getVoice?.()

      utterance.onend = () => resolve()

      if (voice) {
        utterance.voice = voice
      }

      if (now) {
        speechSynthesis.cancel()
      }

      // NOTE: This fixes a "next utterance is not spoken after cancel" issue.
      //
      // On Linux, when a call to `speechSynthesis.speak(utterance)` is
      // immediately preceded by `speechSynthesis.cancel()`, then `utterance`
      // will not be spoken out loud. To work around that, we issue an empty
      // utterance to be sacrificed at the altar of Linux + speech-dispatcher +
      // Chromium so that we all may live… I mean, so `utterance` will be
      // spoken properly.
      speechSynthesis.speak(new SpeechSynthesisUtterance(''))
      speechSynthesis.speak(utterance)
    })
  }

  /**
   * Stops any speaking that is currently happening.
   */
  public stop(): void {
    speechSynthesis.cancel()
  }

  /**
   * Prevents any sound from being made but otherwise functions normally.
   */
  public mute(): void {
    speechSynthesis.cancel()
    this.muted = true
  }

  /**
   * Allows sounds to be made.
   */
  public unmute(): void {
    this.muted = false
  }

  /**
   * Checks whether this TTS is muted.
   */
  public isMuted(): boolean {
    return this.muted
  }

  /**
   * Toggles muted state, or sets it according to the argument.
   */
  public toggleMuted(muted = !this.isMuted()): void {
    if (muted) {
      this.mute()
    } else {
      this.unmute()
    }
  }
}

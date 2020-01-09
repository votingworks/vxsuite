export interface SpeakOptions {
  now?: boolean
}

export interface TextToSpeech {
  /**
   * Directly triggers speech of text. Resolves when speaking is done.
   */
  speak(text: string, options?: SpeakOptions): Promise<void>

  /**
   * Stops any speaking that is currently happening.
   */
  stop(): void
}

/**
 * Implement this to provide screen reading.
 */
export interface ScreenReader {
  /**
   * Call this with an event target when a focus event occurs. Resolves when speaking is done.
   */
  onFocus(target?: EventTarget): Promise<void>

  /**
   * Call this with an event target when a click event occurs. Resolves when speaking is done.
   */
  onClick(target?: EventTarget): Promise<void>

  /**
   * Call this when a page load occurs. Resolves when speaking is done.
   */
  onPageLoad(): Promise<void>

  /**
   * Call this when the screen reader is enabled. Resolves when speaking is done.
   */
  onScreenReaderEnabled(): Promise<void>

  /**
   * Call this when the screen reader is disabled. Resolves when speaking is done.
   */
  onScreenReaderDisabled(): Promise<void>

  /**
   * Directly triggers speech of text. Resolves when speaking is done.
   */
  speak(text: string, options?: SpeakOptions): Promise<void>

  /**
   * Directly triggers speech of an element. Resolves when speaking is done.
   */
  speakNode(element: Element, options?: SpeakOptions): Promise<void>

  /**
   * Directly triggers speech of an event target. Resolves when speaking is done.
   */
  speakEventTarget(target?: EventTarget, options?: SpeakOptions): Promise<void>
}

/**
 * Implements `ScreenReader` using the ARIA DOM attributes.
 */
export class AriaScreenReader implements ScreenReader {
  private readonly tts: TextToSpeech

  /**
   * @param tts A text-to-speech engine to use to speak aloud.
   */
  public constructor(tts: TextToSpeech) {
    this.tts = tts
  }

  /**
   * Call this with an event target when a focus event occurs. Resolves when speaking is done.
   */
  public async onFocus(target?: EventTarget) {
    await this.speakEventTarget(target)
  }

  /**
   * Call this with an event target when a click event occurs. Resolves when speaking is done.
   */
  public async onClick(target?: EventTarget) {
    await this.speakEventTarget(target)
  }

  /**
   * Call this when a page load occurs. Resolves when speaking is done.
   */
  public async onPageLoad(): Promise<void> {
    this.tts.stop()
  }

  /**
   * Call this when the screen reader is enabled. Resolves when speaking is done.
   */
  public async onScreenReaderEnabled(): Promise<void> {
    await this.speak('Screen reader enabled', { now: true })
  }

  /**
   * Call this when the screen reader is disabled. Resolves when speaking is done.
   */
  public async onScreenReaderDisabled(): Promise<void> {
    await this.speak('Screen reader disabled', { now: true })
  }

  /**
   * Directly triggers speech of text. Resolves when speaking is done.
   */
  public async speak(text: string, options: SpeakOptions = {}): Promise<void> {
    /* istanbul ignore next */
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log(`[ScreenReader] speak(now: ${options.now || false}) ${text}`)
    }
    await this.tts.speak(text, options)
  }

  /**
   * Directly triggers speech of an element. Resolves when speaking is done.
   */
  public async speakNode(node: Node, options?: SpeakOptions): Promise<void> {
    const description = this.describe(node)
    if (description) {
      await this.speak(description, options)
    }
  }

  /**
   * Directly triggers speech of an event target. Resolves when speaking is done.
   */
  public async speakEventTarget(
    target?: EventTarget,
    { now = true }: SpeakOptions = {}
  ): Promise<void> {
    if (target && target instanceof Element) {
      await this.speakNode(target, { now })
    }
  }

  /**
   * Generates a clean text string to be spoken for an element.
   */
  public describe(node: Node): string | undefined {
    return this.cleanDescription(this.describeNode(node))
  }

  /**
   * Assembles all text to be spoken for a node but does not clean it up yet.
   */
  private describeNode(node: Node): string | undefined {
    if (!(node instanceof Text) && !(node instanceof Element)) {
      return
    }

    return node instanceof Text
      ? this.describeText(node)
      : this.describeElement(node)
  }

  private cleanDescription(
    description: string | undefined
  ): string | undefined {
    if (!description) {
      return
    }
    return description
      .replace(/ +/g, ' ')
      .replace(/\. +\./g, '.')
      .replace(/,\./g, '.')
      .replace(/ +\./g, '.')
      .replace(/ +,/g, ',')
      .replace(/\.+/g, '.')
      .replace(/ +$/g, '')
      .replace(/^ +/g, '')
  }

  private describeText(node: Text): string | undefined {
    return node.textContent ?? undefined
  }

  private describeElement(node: Element): string | undefined {
    if (this.isHidden(node)) {
      return
    }

    const terminator = this.isBlockElement(node) ? '.' : ''
    const ariaLabel = node.getAttribute('aria-label')

    if (ariaLabel) {
      return ariaLabel + terminator
    }

    const ariaLabeledBy = node.getAttribute('aria-labeledby')

    if (ariaLabeledBy) {
      const element = document.getElementById(ariaLabeledBy)

      if (element) {
        const description = this.describeNode(element)

        if (description) {
          return description + terminator
        }
      }
    }

    return (
      Array.from(node.childNodes)
        .map(child => this.describeNode(child))
        .filter(Boolean)
        .join(' ') + terminator
    )
  }

  /**
   * Determines whether `element` is a block or inline element.
   */
  private isBlockElement(element: Element): boolean {
    return getComputedStyle(element).display === 'block'
  }

  /**
   * Determines whether `element` is hidden from screen readers or not. Elements
   * can be hidden either by setting the `aria-hidden` attribute or using CSS.
   */
  private isHidden(element: Element): boolean {
    if (
      element.hasAttribute('aria-hidden') &&
      element.getAttribute('aria-hidden') !== 'false'
    ) {
      return true
    }

    const style = getComputedStyle(element)

    if (style.display === 'none' || style.visibility === 'hidden') {
      return true
    }

    return false
  }
}

export interface VoiceSelector {
  (): SpeechSynthesisVoice | undefined
}

export class SpeechSynthesisTextToSpeech implements TextToSpeech {
  private getVoice?: VoiceSelector

  public constructor(getVoice?: VoiceSelector) {
    this.getVoice = getVoice
  }

  /**
   * Directly triggers speech of text. Resolves when speaking is done.
   */
  public async speak(
    text: string,
    { now = false }: SpeakOptions = {}
  ): Promise<void> {
    return new Promise(resolve => {
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

      speechSynthesis.speak(utterance)
    })
  }

  /**
   * Stops any speaking that is currently happening.
   */
  public stop(): void {
    speechSynthesis.cancel()
  }
}

export class NullTextToSpeech implements TextToSpeech {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async speak(text: string, options?: SpeakOptions): Promise<void> {
    // nothing to do
  }

  public async stop(): Promise<void> {
    // nothing to do
  }
}

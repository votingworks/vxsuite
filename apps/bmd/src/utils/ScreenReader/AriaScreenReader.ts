import { ScreenReader, SpeakOptions, TextToSpeech } from '../../config/types'

/**
 * Implements `ScreenReader` using the ARIA DOM attributes.
 */
export default class AriaScreenReader implements ScreenReader {
  /**
   * @param tts A text-to-speech engine to use to speak aloud.
   */
  constructor(private tts: TextToSpeech) {}

  /**
   * Call this with an event target when a focus event occurs. Resolves when speaking is done.
   */
  async onFocus(target?: EventTarget): Promise<void> {
    await this.speakEventTarget(target)
  }

  /**
   * Call this with an event target when a click event occurs. Resolves when speaking is done.
   */
  async onClick(target?: EventTarget): Promise<void> {
    await this.speakEventTarget(target)
  }

  /**
   * Call this when a page load occurs. Resolves when speaking is done.
   */
  async onPageLoad(): Promise<void> {
    this.tts.stop()
  }

  /**
   * Enables the screen reader and announces the change. Resolves when speaking
   * is done.
   */
  async enable(): Promise<void> {
    this.unmute()
    await this.speak('Screen reader enabled', { now: true })
  }

  /**
   * Disables the screen reader and announces the change. Resolves when speaking
   * is done.
   */
  async disable(): Promise<void> {
    await this.speak('Screen reader disabled', { now: true })
    this.mute()
  }

  /**
   * Toggles the screen reader being enabled and announces the change. Resolves
   * when speaking is done.
   */
  async toggle(enabled = this.isMuted()): Promise<void> {
    if (enabled) {
      await this.enable()
    } else {
      await this.disable()
    }
  }

  /**
   * Prevents any sound from being made but otherwise functions normally.
   */
  mute(): void {
    return this.tts.mute()
  }

  /**
   * Allows sounds to be made.
   */
  unmute(): void {
    return this.tts.unmute()
  }

  /**
   * Checks whether this TTS is muted.
   */
  isMuted(): boolean {
    return this.tts.isMuted()
  }

  /**
   * Toggles muted state, or sets it according to the argument.
   */
  toggleMuted(muted?: boolean): void {
    this.tts.toggleMuted(muted)
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
      )
    }
    await this.tts.speak(text, options)
  }

  /**
   * Directly triggers speech of an element. Resolves when speaking is done.
   */
  async speakNode(node: Node, options?: SpeakOptions): Promise<void> {
    const description = this.describe(node)
    if (description) {
      await this.speak(description, options)
    }
  }

  /**
   * Directly triggers speech of an event target. Resolves when speaking is done.
   */
  async speakEventTarget(
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
  describe(node: Node): string | undefined {
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

  private cleanDescription(description?: string): string | undefined {
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
        .map((child) => this.describeNode(child))
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

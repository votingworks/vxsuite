import { styleText } from 'node:util';

/**
 * A single text style understood by `util.styleText`, e.g. 'bold' or 'cyan'.
 */
export type TextStyle = Extract<Parameters<typeof styleText>[0], string>;

/**
 * Prints styled text to a stream. Styles are only applied when the stream is
 * a color-capable TTY (or FORCE_COLOR is set), so piped output and tests see
 * plain text.
 */
export class StyledPrinter {
  constructor(private readonly stream: NodeJS.WritableStream) {}

  /**
   * Styles `text` for this printer's stream. Formats are applied one at a
   * time because Node 20's `styleText` skips stream validation for array
   * formats.
   */
  style(formatting: TextStyle | TextStyle[], text: string): string {
    return (Array.isArray(formatting) ? formatting : [formatting]).reduceRight(
      (styled, item) => styleText(item, styled, { stream: this.stream }),
      text
    );
  }

  /**
   * Writes `parts` to the stream followed by a newline.
   */
  println(...parts: string[]): void {
    this.stream.write(`${parts.join('')}\n`);
  }
}

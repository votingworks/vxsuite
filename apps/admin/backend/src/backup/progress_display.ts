import { format } from '@votingworks/utils';

/**
 * What a display is being asked to show. A stage that reads or writes every
 * file knows how far along it is; the rest only know what they are doing.
 */
export type DisplayProgress =
  | { label: string; bytesCompleted: number; bytesTotal: number }
  | { label: string };

const BAR_WIDTH = 24;
const FILLED = '█';
const EMPTY = '░';

/**
 * Turns a step name like `copying_files` into `Copying files`.
 */
export function formatStepLabel(step: string): string {
  const words = step.split('_').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * What fraction of the work is done, from 0 to 1. A stage with nothing to
 * measure counts as complete rather than stuck at zero, so that a caller
 * rendering a bar for it doesn't show an empty one forever.
 */
export function fractionComplete(progress: DisplayProgress): number {
  if (!('bytesTotal' in progress) || progress.bytesTotal === 0) {
    return 1;
  }
  return Math.min(1, progress.bytesCompleted / progress.bytesTotal);
}

/**
 * Renders a progress bar and its counts as a single line, e.g.
 * `Copying files  [████████░░░░░░░░]  52%  154.6 MB of 297.3 MB`.
 */
export function renderProgressLine(
  progress: DisplayProgress,
  labelWidth = 0
): string {
  const fraction = fractionComplete(progress);
  const filledWidth = Math.round(fraction * BAR_WIDTH);
  const bar =
    FILLED.repeat(filledWidth) + EMPTY.repeat(BAR_WIDTH - filledWidth);
  const percent = `${Math.floor(fraction * 100)}`.padStart(3);
  const counts =
    'bytesTotal' in progress && progress.bytesTotal > 0
      ? `  ${format.bytes(progress.bytesCompleted)} of ${format.bytes(
          progress.bytesTotal
        )}`
      : '';
  return `${progress.label.padEnd(labelWidth)}  [${bar}] ${percent}%${counts}`;
}

/**
 * Whether a display that redraws in place should redraw for this update.
 * Progress arrives once per chunk copied, which is far more often than a person
 * can read or a log file should record, so updates that would render the same
 * percentage as the last one drawn are dropped.
 */
export function shouldRedraw(
  progress: DisplayProgress,
  lastDrawnPercent?: number
): boolean {
  const percent = Math.floor(fractionComplete(progress) * 100);
  return percent !== lastDrawnPercent;
}

/**
 * Shows the progress of a long-running command. On a terminal this is a bar
 * that redraws in place; anywhere else — a pipe, a file, a CI log — it is one
 * line per percent, since those have no cursor to move.
 */
export class ProgressDisplay {
  private lastDrawnPercent?: number;
  private lastDrawnLine?: string;
  private lastLabel?: string;

  /**
   * Whether the stream is a terminal is the caller's to know: it is the one
   * holding the real stream, and saying so explicitly keeps this testable
   * without a terminal.
   */
  constructor(
    private readonly stream: NodeJS.WritableStream,
    private readonly isTerminal: boolean,
    private readonly labelWidth = 22
  ) {}

  update(progress: DisplayProgress): void {
    if (
      progress.label !== this.lastLabel ||
      shouldRedraw(progress, this.lastDrawnPercent)
    ) {
      if (progress.label !== this.lastLabel) {
        this.lastLabel = progress.label;
        this.lastDrawnPercent = undefined;
      }
      this.lastDrawnPercent = Math.floor(fractionComplete(progress) * 100);
      this.draw(renderProgressLine(progress, this.labelWidth));
    }
  }

  /**
   * Prints a line above the bar, leaving the bar where it is at the bottom of
   * the terminal. Without this, anything else writing to the same stream would
   * land in the middle of the bar's row and be overwritten by the next redraw.
   */
  writeAbove(text: string): void {
    if (this.isTerminal) {
      // \u001b[2K is the ANSI erase-line control sequence.
      this.stream.write(`\r\u001b[2K${text}\n`);
      if (this.lastDrawnLine !== undefined) {
        this.stream.write(this.lastDrawnLine);
      }
      return;
    }
    this.stream.write(`${text}\n`);
  }

  /**
   * Leaves the cursor somewhere sane for whatever the caller prints next.
   */
  finish(): void {
    if (this.isTerminal) {
      this.stream.write('\n');
    }
  }

  private draw(line: string): void {
    this.lastDrawnLine = line;
    if (this.isTerminal) {
      // Carriage return plus \u001b[2K, the ANSI erase-line control sequence,
      // so the bar occupies one row no matter how many times it is redrawn.
      this.stream.write(`\r\u001b[2K${line}`);
      return;
    }
    this.stream.write(`${line}\n`);
  }
}

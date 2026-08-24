import { format } from '@votingworks/utils';

/**
 * What a display is being asked to show. A step that copies every file knows
 * how many bytes it has done; one that reports a fraction knows only how far
 * along it is; the rest only know what they are doing.
 */
export type DisplayProgress =
  | { label: string; bytesCompleted: number; bytesTotal: number }
  | { label: string; fraction: number }
  | { label: string };

const BAR_WIDTH = 24;
const FILLED = '█';
const EMPTY = '░';

/**
 * What fraction of the work is done, from 0 to 1. A step with nothing to
 * measure counts as complete rather than stuck at zero, so that a caller
 * rendering a bar for it doesn't show an empty one forever.
 */
export function fractionComplete(progress: DisplayProgress): number {
  if ('fraction' in progress) {
    return Math.min(1, Math.max(0, progress.fraction));
  }
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
 * Progress arrives far more often than a person can read or a log file should
 * record, so updates that would render the same percentage as the last one
 * drawn are dropped.
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
    const labelChanged = progress.label !== this.lastLabel;

    if (!labelChanged && !shouldRedraw(progress, this.lastDrawnPercent)) {
      return;
    }

    // A new step always draws, even at the same percentage as the last one,
    // so that reaching it is visible.
    this.lastLabel = progress.label;
    this.lastDrawnPercent = Math.floor(fractionComplete(progress) * 100);
    this.draw(renderProgressLine(progress, this.labelWidth));
  }

  /**
   * Erases the bar so the caller can print something in its place. A stream
   * with no cursor has nothing to erase: each update was its own line, and
   * those stay as the record of what happened.
   */
  clear(): void {
    if (this.isTerminal) {
      // \u001b[2K is the ANSI erase-line control sequence.
      this.stream.write('\r\u001b[2K');
    }
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
    if (this.isTerminal) {
      // Carriage return plus \u001b[2K, the ANSI erase-line control
      // sequence, so the bar occupies one row no matter how many times it
      // is redrawn.
      this.stream.write(`\r\u001b[2K${line}`);
      return;
    }
    this.stream.write(`${line}\n`);
  }
}

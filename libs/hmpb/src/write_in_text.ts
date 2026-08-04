import { PDFFont } from 'pdf-lib';
import { assertDefined } from '@votingworks/basics';

/**
 * Largest font size used to print a write-in name, in `pt`.
 */
export const WRITE_IN_FONT_SIZE_MAX = 12;

/**
 * Smallest font size used to print a write-in name, in `pt`. A name that still
 * doesn't fit its write-in area at this size is truncated rather than shrunk
 * further, since smaller text can't be reliably read by a write-in adjudicator.
 */
export const WRITE_IN_FONT_SIZE_MIN = 6;

/**
 * Distance between the baselines of consecutive lines of a wrapped write-in
 * name, as a multiple of the font size. Tight, since write-in areas are only
 * about one grid row tall.
 */
const LINE_SPACING = 1.05;

const TRUNCATION_SUFFIX = '...';

/**
 * A write-in name laid out to fit within a write-in area.
 */
export interface FittedWriteInText {
  /** The name, split into the lines to print, top to bottom. */
  readonly lines: readonly string[];
  /** Font size to print the lines at, in `pt`. */
  readonly fontSize: number;
}

/**
 * A piece of text that may start a new line, along with whether it is separated
 * from the preceding piece by a space.
 */
interface Segment {
  readonly text: string;
  readonly precededBySpace: boolean;
}

/**
 * Splits text at the points where it may be broken across lines: at whitespace,
 * and after hyphens, so that a hyphenated name breaks at the hyphen rather than
 * mid-syllable.
 */
function breakIntoSegments(text: string): Segment[] {
  return text
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .flatMap((word) =>
      assertDefined(word.match(/[^-]*-|[^-]+/g)).map((part, index) => ({
        text: part,
        precededBySpace: index === 0,
      }))
    );
}

/**
 * Splits text into lines that each fit within {@link maxWidth}. A segment too
 * long to fit on a line of its own is broken across lines mid-segment, so every
 * returned line is guaranteed to fit.
 */
function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  font: PDFFont
): string[] {
  function fits(line: string): boolean {
    return font.widthOfTextAtSize(line, fontSize) <= maxWidth;
  }

  const lines: string[] = [];
  let line = '';

  for (const segment of breakIntoSegments(text)) {
    const separator = line !== '' && segment.precededBySpace ? ' ' : '';
    const extendedLine = `${line}${separator}${segment.text}`;
    if (fits(extendedLine)) {
      line = extendedLine;
      continue;
    }

    if (line !== '') {
      lines.push(line);
      line = '';
    }

    let rest = segment.text;
    while (!fits(rest)) {
      // Find the longest prefix that fits, taking at least one character so
      // that we make progress even if a single character is too wide.
      let length = Math.max(1, rest.length - 1);
      while (length > 1 && !fits(rest.slice(0, length))) {
        length -= 1;
      }
      lines.push(rest.slice(0, length));
      rest = rest.slice(length);
    }
    line = rest;
  }

  if (line !== '') {
    lines.push(line);
  }

  return lines;
}

/**
 * Number of lines of text at {@link fontSize} that fit within
 * {@link areaHeight}: the first line takes up the font size itself, and each
 * subsequent line adds a line's worth of spacing.
 */
function maxLineCount(areaHeight: number, fontSize: number): number {
  return Math.floor(1 + (areaHeight / fontSize - 1) / LINE_SPACING);
}

/**
 * Lays out a write-in name so that it is fully contained within a write-in area
 * of the given dimensions (in `pt`).
 *
 * A name that doesn't fit on a single line at the largest font size is wrapped
 * onto multiple lines and printed at the largest font size whose wrapped lines
 * fit the area's width and height. Write-in areas vary in size from ballot
 * template to ballot template, and a voter may enter a name of up to 40
 * characters, so it's important that a long name be contained: text spilling
 * out of the area could obscure a neighboring contest's options and be read as
 * a mark there.
 */
export function fitWriteInText(
  name: string,
  areaWidth: number,
  areaHeight: number,
  font: PDFFont
): FittedWriteInText {
  for (
    let fontSize = WRITE_IN_FONT_SIZE_MAX;
    fontSize >= WRITE_IN_FONT_SIZE_MIN;
    fontSize -= 1
  ) {
    const lines = wrapText(name, areaWidth, fontSize, font);
    if (
      lines.length > 0 &&
      lines.length <= maxLineCount(areaHeight, fontSize)
    ) {
      return { lines, fontSize };
    }
  }

  // The name doesn't fit even at the smallest font size, so truncate it. Shrink
  // below the minimum font size only if the area is too short to fit even a
  // single line, so that the text is always contained.
  const fontSize = Math.min(WRITE_IN_FONT_SIZE_MIN, areaHeight);
  const lines = wrapText(name, areaWidth, fontSize, font).slice(
    0,
    Math.max(1, maxLineCount(areaHeight, fontSize))
  );
  if (lines.length === 0) {
    return { lines, fontSize };
  }

  const lastIndex = lines.length - 1;
  let lastLine = assertDefined(lines[lastIndex]);
  while (
    lastLine.length > 0 &&
    font.widthOfTextAtSize(`${lastLine}${TRUNCATION_SUFFIX}`, fontSize) >
      areaWidth
  ) {
    lastLine = lastLine.slice(0, -1);
  }
  lines[lastIndex] = `${lastLine}${TRUNCATION_SUFFIX}`;

  return { lines, fontSize };
}

/**
 * Vertical offset of the baseline of one line of fitted text, measured down
 * from the top of the write-in area, in `pt`. The lines are centered vertically
 * within the area as a block.
 */
export function writeInLineBaselineOffset(
  text: FittedWriteInText,
  lineIndex: number,
  areaHeight: number
): number {
  const { fontSize, lines } = text;
  const blockHeight = fontSize * (1 + (lines.length - 1) * LINE_SPACING);
  return (
    0.5 * (areaHeight - blockHeight) +
    fontSize +
    lineIndex * fontSize * LINE_SPACING
  );
}

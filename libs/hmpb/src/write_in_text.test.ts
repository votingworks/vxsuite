import fs from 'node:fs';
import { beforeAll, describe, expect, test } from 'vitest';
import fontKit from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont } from 'pdf-lib';

import {
  fitWriteInText,
  WRITE_IN_FONT_SIZE_MAX,
  WRITE_IN_FONT_SIZE_MIN,
  writeInLineBaselineOffset,
} from './write_in_text';

let font: PDFFont;

beforeAll(async () => {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontKit);
  font = await doc.embedFont(
    fs.readFileSync(`${__dirname}/fonts/Roboto-Bold.ttf`)
  );
});

/**
 * Dimensions of a write-in area on a letter-size ballot rendered with the
 * VxDefault template, in `pt`.
 */
const VX_DEFAULT_AREA = { width: 134.8, height: 19.1 } as const;

/**
 * Dimensions of a write-in area on a letter-size ballot rendered with the
 * NhState template, the narrowest of our templates, in `pt`.
 */
const NH_STATE_AREA = { width: 74.3, height: 19.1 } as const;

/** The longest name a voter can enter at VxMark. */
const MAX_LENGTH_NAME = 'W'.repeat(40);

function widthOf(line: string, fontSize: number): number {
  return font.widthOfTextAtSize(line, fontSize);
}

function expectFitsWithin(
  name: string,
  area: { width: number; height: number }
) {
  const text = fitWriteInText(name, area.width, area.height, font);
  for (const line of text.lines) {
    expect(widthOf(line, text.fontSize)).toBeLessThanOrEqual(area.width);
  }
  const lastIndex = text.lines.length - 1;
  expect(
    writeInLineBaselineOffset(text, lastIndex, area.height)
  ).toBeLessThanOrEqual(area.height);
  expect(
    writeInLineBaselineOffset(text, 0, area.height) - text.fontSize
  ).toBeGreaterThanOrEqual(0);
  return text;
}

test('prints a short name on one line at the largest font size', () => {
  const text = fitWriteInText(
    'Jane Q. Public',
    VX_DEFAULT_AREA.width,
    VX_DEFAULT_AREA.height,
    font
  );
  expect(text).toEqual({
    lines: ['Jane Q. Public'],
    fontSize: WRITE_IN_FONT_SIZE_MAX,
  });
});

test('wraps a long name onto multiple lines rather than overflowing', () => {
  const text = expectFitsWithin(
    'BARTHOLOMEW MONTGOMERY-WINTERBOTTOM III',
    VX_DEFAULT_AREA
  );
  expect(text.lines.length).toBeGreaterThan(1);
  expect(text.lines.join(' ')).toEqual(
    'BARTHOLOMEW MONTGOMERY- WINTERBOTTOM III'
  );
});

test('breaks a hyphenated name at the hyphen', () => {
  const text = expectFitsWithin(
    'BARTHOLOMEW MONTGOMERY-WINTERBOTTOM III',
    NH_STATE_AREA
  );
  expect(text.lines).toEqual([
    'BARTHOLOMEW',
    'MONTGOMERY-',
    'WINTERBOTTOM III',
  ]);
});

test('breaks mid-word when a single word is too wide for a line', () => {
  const text = expectFitsWithin('W'.repeat(24), NH_STATE_AREA);
  expect(text.lines.length).toBeGreaterThan(1);
  expect(text.lines.join('')).toEqual('W'.repeat(24));
});

test('fits the longest name a voter can enter in the narrowest write-in area', () => {
  const text = expectFitsWithin(MAX_LENGTH_NAME, NH_STATE_AREA);
  expect(text.lines.join('')).toEqual(MAX_LENGTH_NAME);
  expect(text.fontSize).toBeGreaterThanOrEqual(WRITE_IN_FONT_SIZE_MIN);
});

test('ignores extra whitespace', () => {
  const text = fitWriteInText(
    '  Jane   Q. Public  ',
    VX_DEFAULT_AREA.width,
    VX_DEFAULT_AREA.height,
    font
  );
  expect(text.lines).toEqual(['Jane Q. Public']);
});

test('prints nothing for a name with no printable characters', () => {
  expect(
    fitWriteInText('   ', VX_DEFAULT_AREA.width, VX_DEFAULT_AREA.height, font)
      .lines
  ).toEqual([]);
});

describe('when a name cannot be made to fit', () => {
  // An area far too small for any real ballot template, to exercise the
  // truncation fallback.
  const tinyArea = { width: 30, height: 8 } as const;

  test('truncates it', () => {
    const text = expectFitsWithin(MAX_LENGTH_NAME, tinyArea);
    expect(text.fontSize).toEqual(WRITE_IN_FONT_SIZE_MIN);
    expect(text.lines).toHaveLength(1);
    expect(text.lines[0]).toMatch(/^W+\.\.\.$/);
  });

  test('truncates it to just an ellipsis if nothing else fits', () => {
    const text = expectFitsWithin(MAX_LENGTH_NAME, { width: 6, height: 8 });
    expect(text.lines).toEqual(['...']);
  });

  test('shrinks below the minimum font size if the area is too short for one line', () => {
    const text = expectFitsWithin(MAX_LENGTH_NAME, { width: 30, height: 4 });
    expect(text.fontSize).toBeLessThan(WRITE_IN_FONT_SIZE_MIN);
  });

  test('prints nothing for a name with no printable characters', () => {
    expect(
      fitWriteInText('   ', tinyArea.width, tinyArea.height, font).lines
    ).toEqual([]);
  });
});

test('centers the lines vertically within the area', () => {
  const oneLine = fitWriteInText(
    'Jane Q. Public',
    VX_DEFAULT_AREA.width,
    VX_DEFAULT_AREA.height,
    font
  );
  // A single line's baseline sits a font size below the vertically centered
  // top of the text.
  expect(writeInLineBaselineOffset(oneLine, 0, VX_DEFAULT_AREA.height)).toEqual(
    0.5 * (VX_DEFAULT_AREA.height - oneLine.fontSize) + oneLine.fontSize
  );

  const threeLines = fitWriteInText(
    'BARTHOLOMEW MONTGOMERY-WINTERBOTTOM III',
    NH_STATE_AREA.width,
    NH_STATE_AREA.height,
    font
  );
  expect(threeLines.lines).toHaveLength(3);
  const offsets = threeLines.lines.map((_, index) =>
    writeInLineBaselineOffset(threeLines, index, NH_STATE_AREA.height)
  );
  // Lines are evenly spaced...
  expect(offsets[1] - offsets[0]).toBeCloseTo(offsets[2] - offsets[1]);
  // ...and the block is centered: the space above the first line's top matches
  // the space below the last line's baseline.
  expect(offsets[0] - threeLines.fontSize).toBeCloseTo(
    NH_STATE_AREA.height - offsets[2]
  );
});

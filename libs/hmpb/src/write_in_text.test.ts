import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { join, relative } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import fontKit from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont, rgb } from 'pdf-lib';
import { pdfToImages, toImageBuffer } from '@votingworks/image-utils';
import { assertDefined } from '@votingworks/basics';
import {
  ballotPaperDimensions,
  gridPositionsFromBallotPositions,
  safeParseElection,
} from '@votingworks/types';

import { fixturesDir } from './ballot_fixtures.js';
import { gridSpacing } from './marking.js';
import {
  drawWriteInText,
  fitWriteInText,
  WRITE_IN_FONT_SIZE_MAX,
  WRITE_IN_FONT_SIZE_MIN,
  WriteInArea,
  writeInLineBaselineOffset,
} from './write_in_text.js';

let font: PDFFont;

beforeAll(async () => {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontKit);
  font = await doc.embedFont(
    fs.readFileSync(`${import.meta.dirname}/fonts/Roboto-Bold.ttf`)
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

/**
 * A write-in area far too small for any real ballot template, used to exercise
 * the truncation backstop.
 */
const TINY_AREA = { width: 30, height: 8 } as const;

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

// Truncation means the layout failed - a ballot template declared a write-in
// area too small for a name a voter is allowed to enter. It can't happen on any
// ballot we generate (see the test above), so these cases use fabricated areas
// smaller than any real template's to pin down the backstop behavior.
describe('when the layout fails because a name cannot be made to fit', () => {
  test('truncates it only after shrinking all the way to the minimum size', () => {
    const text = expectFitsWithin(MAX_LENGTH_NAME, TINY_AREA);
    expect(text.fontSize).toEqual(WRITE_IN_FONT_SIZE_MIN);
    expect(text.lines.join('')).not.toEqual(MAX_LENGTH_NAME);
    expect(assertDefined(text.lines.at(-1))).toMatch(/\.\.\.$/);
  });

  test('leaves the last line as just an ellipsis if no characters fit alongside it', () => {
    const text = expectFitsWithin(MAX_LENGTH_NAME, { width: 3, height: 8 });
    expect(text.lines.at(-1)).toEqual('...');
  });

  test('shrinks below the minimum font size if the area is too short for one line', () => {
    const text = expectFitsWithin(MAX_LENGTH_NAME, { width: 30, height: 2 });
    expect(text.fontSize).toBeLessThan(WRITE_IN_FONT_SIZE_MIN);
  });

  test('prints nothing for a name with no printable characters', () => {
    expect(
      fitWriteInText('   ', TINY_AREA.width, TINY_AREA.height, font).lines
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

/**
 * Renders just a write-in area - its outline, plus the given name drawn inside
 * it by {@link drawWriteInText} - so that the layout can be reviewed visually in
 * isolation from a whole ballot.
 */
async function renderWriteInArea(
  name: string,
  area: { width: number; height: number }
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontKit);
  const robotoBold = await doc.embedFont(
    fs.readFileSync(`${import.meta.dirname}/fonts/Roboto-Bold.ttf`)
  );

  // Leave a margin around the area so that any text escaping it is visible in
  // the snapshot rather than clipped at the page edge.
  const margin = 8;
  const page = doc.addPage([area.width + 2 * margin, area.height + 2 * margin]);
  const areaOnPage: WriteInArea = { x: margin, y: margin, ...area };
  page.drawRectangle({
    ...areaOnPage,
    borderColor: rgb(0.6, 0.6, 0.6),
    borderWidth: 0.5,
  });
  drawWriteInText(page, robotoBold, name, areaOnPage);

  const images: Buffer[] = [];
  // Scale up, since a write-in area is only about a quarter inch tall.
  for await (const image of pdfToImages(await doc.save(), { scale: 6 })) {
    images.push(toImageBuffer(image.page));
  }
  return assertDefined(images[0]);
}

function findElectionPaths(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return findElectionPaths(path);
    return entry.name === 'election.json' ? [path] : [];
  });
}

/**
 * The fixture directory for each ballot template, so that this test fails rather
 * than silently under-covering if a template's fixtures move or stop recording
 * ballot positions.
 */
const FIXTURES_PER_BALLOT_TEMPLATE = [
  'vx-general-election', // VxDefaultBallot
  'nh-general-election', // NhBallot
  'nh-state-general-election', // NhStateBallot
  'ms-general-election', // MsBallot
  'mi-general-election', // MiBallot
] as const;

test('every write-in area on the ballots we generate fits the longest name a voter can enter', () => {
  const areasChecked: string[] = [];
  const failures: string[] = [];
  const fixturesCovered = new Set<string>();

  // Many fixture spec directories share an identical election definition, and
  // parsing each one is slow, so only check each distinct definition once.
  const seenElections = new Set<string>();

  for (const electionPath of findElectionPaths(fixturesDir)) {
    const electionJson = fs.readFileSync(electionPath, 'utf8');
    const fixture = relative(fixturesDir, electionPath);
    if (seenElections.has(electionJson)) {
      fixturesCovered.add(fixture.split('/')[0]);
      continue;
    }
    seenElections.add(electionJson);

    const election = safeParseElection(JSON.parse(electionJson)).unsafeUnwrap();
    const spacing = gridSpacing(
      ballotPaperDimensions(election.ballotLayout.paperSize)
    );

    for (const ballotStyle of election.ballotStyles) {
      if (!ballotStyle.ballotPositions) continue;

      for (const position of gridPositionsFromBallotPositions(
        ballotStyle.ballotPositions
      )) {
        if (position.type !== 'write-in') continue;

        const text = fitWriteInText(
          MAX_LENGTH_NAME,
          position.writeInArea.width * spacing.columnGap,
          position.writeInArea.height * spacing.rowGap,
          font
        );
        const where = `${fixture} ${ballotStyle.id} ${position.contestId}`;

        // The whole name is printed, not truncated...
        if (text.lines.join('') !== MAX_LENGTH_NAME) {
          failures.push(`${where}: truncated to "${text.lines.join('')}"`);
        }
        // ...and comfortably above the size we'd fall back to.
        if (text.fontSize <= WRITE_IN_FONT_SIZE_MIN) {
          failures.push(`${where}: shrunk to ${text.fontSize}pt`);
        }

        areasChecked.push(where);
        fixturesCovered.add(fixture.split('/')[0]);
      }
    }
  }

  expect(failures).toEqual([]);
  expect([...fixturesCovered].sort()).toEqual(
    expect.arrayContaining([...FIXTURES_PER_BALLOT_TEMPLATE].sort())
  );
  expect(areasChecked.length).toBeGreaterThan(0);
}, 60_000);

describe('renders a write-in area containing', () => {
  test.each([
    {
      label: 'a short name, at the largest font size',
      name: 'Jane Q. Public',
      area: VX_DEFAULT_AREA,
    },
    {
      label: 'a name broken at spaces',
      name: 'ALEXANDRIA WASHINGTON JEFFERSON',
      area: VX_DEFAULT_AREA,
    },
    {
      label: 'a name broken at spaces, in a narrow area',
      name: 'ALEXANDRIA WASHINGTON JEFFERSON',
      area: NH_STATE_AREA,
    },
    {
      label: 'a name broken at hyphens',
      name: 'BARTHOLOMEW MONTGOMERY-WINTERBOTTOM III',
      area: VX_DEFAULT_AREA,
    },
    {
      label: 'a name broken at hyphens, in a narrow area',
      name: 'BARTHOLOMEW MONTGOMERY-WINTERBOTTOM III',
      area: NH_STATE_AREA,
    },
    {
      label: 'a single word broken mid-word',
      name: 'SCHWARZENEGGERSCHWARZENEGGER',
      area: NH_STATE_AREA,
    },
    {
      label: 'a wrapped name with descenders',
      name: 'Jacqueline Pettygrove-Younghyun',
      area: NH_STATE_AREA,
    },
    {
      label: 'the longest name a voter can enter, in a narrow area',
      name: MAX_LENGTH_NAME,
      area: NH_STATE_AREA,
    },
    // Only reachable if a template declares a write-in area too small for a name
    // a voter can enter, i.e. if the layout failed. The ellipsis is the signal.
    {
      label: 'a name truncated because the layout failed',
      name: 'BARTHOLOMEW MONTGOMERY-WINTERBOTTOM III',
      area: TINY_AREA,
    },
    {
      label: 'the longest name a voter can enter, truncated',
      name: MAX_LENGTH_NAME,
      area: TINY_AREA,
    },
  ])('$label', async ({ name, area }) => {
    expect(await renderWriteInArea(name, area)).toMatchImageSnapshot();
  });
});

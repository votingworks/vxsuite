import {
  Color,
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  appendBezierCurve,
  breakTextIntoLines,
  closePath,
  fill,
  lineTo,
  moveTo,
  rgb,
  grayscale,
  setFillingGrayscaleColor,
  setStrokingGrayscaleColor,
  setLineWidth,
  stroke,
} from 'pdf-lib';
import fontKit from '@pdf-lib/fontkit';
import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { assertDefined, iter } from '@votingworks/basics';
import {
  AnyContest,
  BallotMode,
  BallotStyle,
  BallotStyleId,
  BallotType,
  BaseBallotProps,
  CandidateContest,
  Election,
  GridLayout,
  GridPosition,
  Outset,
  YesNoContest,
  ballotPaperDimensions,
  getBallotStyle,
  getContests,
  getOrderedCandidatesForContestInBallotStyle,
  getPartyForBallotStyle,
} from '@votingworks/types';
import {
  BUBBLE_HEIGHT_PX,
  BUBBLE_WIDTH_PX,
  OptionInfo,
  pageMarginsInches,
  TIMING_MARK_DIMENSIONS,
  timingMarkCounts,
} from './ballot_components';
import { hmpbStringsCatalog } from './hmpb_strings';
import { layOutInColumns } from './layout_in_columns';
import { GridMeasurements } from './render_ballot';

// Canvas is loaded dynamically via image-utils' dependency to avoid adding
// it as a direct dependency of this package.
interface CanvasLib {
  createCanvas: (
    w: number,
    h: number
  ) => {
    getContext: (type: '2d') => unknown;
    toBuffer: (mime: string) => Buffer;
  };
  loadImage: (src: Buffer) => Promise<unknown>;
}
const canvasPath = require.resolve('canvas', {
  paths: [require.resolve('@votingworks/image-utils')],
});
// eslint-disable-next-line import/no-dynamic-require, @typescript-eslint/no-var-requires
const canvasLib: CanvasLib = require(canvasPath);

// ─── Unit Conversions ───────────────────────────────────────────────────────

const PT = 1;
const IN = 72 * PT;
const PX = IN / 96; // CSS pixel to PDF point

// ─── Font Config ────────────────────────────────────────────────────────────

const FONT_SIZE_BASE = 12; // pt - matches CSS `font-size: 12pt`
const FONT_SIZE_H1 = FONT_SIZE_BASE * 1.4; // 16.8pt
const FONT_SIZE_H2 = FONT_SIZE_BASE * 1.2; // 14.4pt
const FONT_SIZE_H3 = FONT_SIZE_BASE * 1.1; // 13.2pt
const FONT_SIZE_SMALL = FONT_SIZE_BASE * 0.85; // ~10.2pt (footer page label)
const FONT_SIZE_WRITE_IN_LABEL = FONT_SIZE_BASE * 0.8; // 9.6pt
const FONT_SIZE_METADATA = 8; // 8pt (footer metadata)
const LINE_HEIGHT = 1.2;

// ─── Layout Constants ───────────────────────────────────────────────────────

// Timing marks
const TM_W = TIMING_MARK_DIMENSIONS.width * IN;
const TM_H = TIMING_MARK_DIMENSIONS.height * IN;

// Bubbles in PDF points
const BUBBLE_W = BUBBLE_WIDTH_PX * PX;
const BUBBLE_H = BUBBLE_HEIGHT_PX * PX;
// const BUBBLE_BORDER_RADIUS = 7 * PX;

// Page margins
const MARGIN_TOP = pageMarginsInches.top * IN;
const MARGIN_BOTTOM = pageMarginsInches.bottom * IN;
const MARGIN_LEFT = pageMarginsInches.left * IN;
const MARGIN_RIGHT = pageMarginsInches.right * IN;

// Content padding within the timing mark grid frame
const FRAME_PADDING = 0.125 * IN; // 9pt

// 0.75rem = 0.75 * 12pt = 9pt (gap between frame sections and columns)
const SECTION_GAP = 0.75 * FONT_SIZE_BASE;
const COLUMN_GAP = SECTION_GAP;

// Padding within contest boxes
const CONTEST_HEADER_PAD = 0.5 * FONT_SIZE_BASE; // 0.5rem = 6pt
const OPTION_PAD_V = 0.375 * FONT_SIZE_BASE; // 0.375rem = 4.5pt
const OPTION_PAD_H = 0.5 * FONT_SIZE_BASE; // 0.5rem = 6pt
const BUBBLE_GAP = 0.5 * FONT_SIZE_BASE; // gap between bubble and text

// QR code slot dimensions
const QR_CODE_W = 0.6 * IN;
const QR_CODE_H = 0.6 * IN;

// ─── Colors ─────────────────────────────────────────────────────────────────

const BLACK: Color = grayscale(0);
const WHITE: Color = grayscale(1);
const LIGHT_GRAY: Color = rgb(0xed / 255, 0xed / 255, 0xed / 255);
const DARK_GRAY: Color = rgb(0xda / 255, 0xda / 255, 0xda / 255);

// ─── SVG to PNG Conversion ──────────────────────────────────────────────────

async function svgToPng(
  svgString: string,
  widthPx: number,
  heightPx: number
): Promise<Buffer> {
  const img = await canvasLib.loadImage(Buffer.from(svgString));
  const c = canvasLib.createCanvas(widthPx, heightPx);
  const ctx = c.getContext('2d') as {
    drawImage: (
      img: unknown,
      x: number,
      y: number,
      w: number,
      h: number
    ) => void;
  };
  ctx.drawImage(img, 0, 0, widthPx, heightPx);
  return c.toBuffer('image/png');
}

// ─── Font Loading ───────────────────────────────────────────────────────────

const robotoRegularTtf = fs.readFileSync(
  `${__dirname}/fonts/Roboto-Regular.ttf`
);
const robotoBoldTtf = fs.readFileSync(`${__dirname}/fonts/Roboto-Bold.ttf`);
const robotoItalicTtf = fs.readFileSync(`${__dirname}/fonts/Roboto-Italic.ttf`);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

// ─── Text Layout ────────────────────────────────────────────────────────────

interface TextLine {
  text: string;
  width: number;
}

function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): TextLine[] {
  const lines = breakTextIntoLines(text, [' '], maxWidth, (t) =>
    font.widthOfTextAtSize(t, fontSize)
  );
  return lines.map((line) => ({
    text: line,
    width: font.widthOfTextAtSize(line, fontSize),
  }));
}

function textHeight(
  numLines: number,
  fontSize: number,
  lineHeight: number = LINE_HEIGHT
): number {
  if (numLines === 0) return 0;
  return fontSize * lineHeight * numLines;
}

function measureTextBlock(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): { lines: TextLine[]; height: number } {
  const lines = wrapText(text, font, fontSize, maxWidth);
  return {
    lines,
    height: textHeight(lines.length, fontSize),
  };
}

// ─── Rich Text (HTML) Parsing & Rendering ───────────────────────────────────

interface RichTextSpan {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
}

type RichTextNode =
  | { type: 'paragraph'; spans: RichTextSpan[] }
  | { type: 'listItem'; spans: RichTextSpan[]; ordered: boolean; index: number }
  | {
      type: 'table';
      rows: Array<{
        cells: Array<{ spans: RichTextSpan[]; isHeader: boolean }>;
      }>;
    }
  | { type: 'image'; src: string };

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Parses HTML into structured rich text nodes. Handles:
 * <p>, <strong>/<b>, <em>/<i>, <u>, <s>, <ol>/<ul>/<li>,
 * <table>/<tr>/<th>/<td>, <img>, <br>
 */
function parseHtml(html: string): RichTextNode[] {
  const nodes: RichTextNode[] = [];
  let currentSpans: RichTextSpan[] = [];
  let bold = false;
  let italic = false;
  let underline = false;
  let strikethrough = false;
  let listCounter = 0;
  let inOrderedList = false;
  let inUnorderedList = false;
  let tableRows: Array<{
    cells: Array<{ spans: RichTextSpan[]; isHeader: boolean }>;
  }> = [];
  let currentRow: Array<{ spans: RichTextSpan[]; isHeader: boolean }> = [];
  let inCell = false;

  function flushParagraph() {
    if (currentSpans.length > 0) {
      nodes.push({ type: 'paragraph', spans: currentSpans });
      currentSpans = [];
    }
  }

  function flushListItem() {
    if (currentSpans.length > 0) {
      nodes.push({
        type: 'listItem',
        spans: currentSpans,
        ordered: inOrderedList,
        index: listCounter,
      });
      currentSpans = [];
    }
  }

  function makeSpan(text: string): RichTextSpan {
    return { text, bold, italic, underline, strikethrough };
  }

  const tagRegex = /<(\/?)([a-z][a-z0-9]*)\s*([^>]*)\/?>|([^<]+)/gi;
  let match = tagRegex.exec(html);
  while (match) {
    const [, closing, tagName, attrs, textContent] = match;
    if (textContent) {
      const decoded = decodeEntities(textContent);
      if (decoded.trim()) {
        if (inCell) {
          currentSpans.push(makeSpan(decoded));
        } else {
          currentSpans.push(makeSpan(decoded));
        }
      }
    } else if (tagName) {
      const tag = tagName.toLowerCase();
      const isClosing = closing === '/';

      switch (tag) {
        case 'p':
        case 'div':
          if (isClosing) {
            if (inCell) {
              // Don't flush; cell content accumulates
            } else if (inOrderedList || inUnorderedList) {
              // Content within list items
            } else {
              flushParagraph();
            }
          }
          break;
        case 'br':
          if (!inCell) flushParagraph();
          break;
        case 'strong':
        case 'b':
          bold = !isClosing;
          break;
        case 'em':
        case 'i':
          italic = !isClosing;
          break;
        case 'u':
          underline = !isClosing;
          break;
        case 's':
          strikethrough = !isClosing;
          break;
        case 'ol':
          if (!isClosing) {
            flushParagraph();
            listCounter = 0;
            inOrderedList = true;
          } else {
            inOrderedList = false;
          }
          break;
        case 'ul':
          if (!isClosing) {
            flushParagraph();
            listCounter = 0;
            inUnorderedList = true;
          } else {
            inUnorderedList = false;
          }
          break;
        case 'li':
          if (!isClosing) {
            listCounter += 1;
          } else {
            flushListItem();
          }
          break;
        case 'table':
          if (!isClosing) {
            flushParagraph();
            tableRows = [];
          } else {
            if (tableRows.length > 0) {
              nodes.push({ type: 'table', rows: tableRows });
            }
            tableRows = [];
          }
          break;
        case 'tr':
          if (!isClosing) {
            currentRow = [];
          } else if (currentRow.length > 0) {
            tableRows.push({ cells: currentRow });
          }
          break;
        case 'th':
          if (!isClosing) {
            inCell = true;
            currentSpans = [];
            bold = true;
          } else {
            currentRow.push({ spans: currentSpans, isHeader: true });
            currentSpans = [];
            inCell = false;
            bold = false;
          }
          break;
        case 'td':
          if (!isClosing) {
            inCell = true;
            currentSpans = [];
          } else {
            currentRow.push({ spans: currentSpans, isHeader: false });
            currentSpans = [];
            inCell = false;
          }
          break;
        case 'img': {
          // Extract src attribute
          const srcMatch = /src="([^"]*)"/.exec(attrs ?? '');
          if (srcMatch) {
            nodes.push({ type: 'image', src: srcMatch[1] });
          }
          break;
        }
        case 'colgroup':
        case 'col':
        case 'tbody':
        case 'thead':
          // Structural tags we can ignore
          break;
        default:
          break;
      }
    }
    match = tagRegex.exec(html);
  }
  flushParagraph();
  return nodes;
}

function selectFont(span: RichTextSpan, fonts: Fonts): PDFFont {
  if (span.bold && span.italic) return fonts.bold; // no bold-italic, fallback to bold
  if (span.bold) return fonts.bold;
  if (span.italic) return fonts.italic;
  return fonts.regular;
}

function measureRichText(
  html: string,
  fonts: Fonts,
  fontSize: number,
  maxWidth: number
): number {
  const richNodes = parseHtml(html);
  let height = 0;
  const lineH = fontSize * LINE_HEIGHT;
  const paragraphGap = fontSize * 0.5;
  const listIndent = fontSize * 1.8;

  for (const node of richNodes) {
    switch (node.type) {
      case 'paragraph': {
        const text = node.spans
          .map((s) => s.text)
          .join('')
          .trim();
        if (!text) break;
        const font = selectFont(node.spans[0], fonts);
        const lines = wrapText(text, font, fontSize, maxWidth);
        height += lines.length * lineH + paragraphGap;
        break;
      }
      case 'listItem': {
        const text = node.spans
          .map((s) => s.text)
          .join('')
          .trim();
        if (!text) break;
        const font = selectFont(node.spans[0], fonts);
        const lines = wrapText(text, font, fontSize, maxWidth - listIndent);
        height += lines.length * lineH;
        break;
      }
      case 'table': {
        // Estimate table height: each row is one line plus borders
        const borderW = PX;
        height += borderW; // top border
        height += node.rows.length * (lineH + 2 * (0.25 * fontSize) + borderW);
        height += paragraphGap;
        break;
      }
      case 'image':
        height += 40 + paragraphGap; // estimated image height
        break;
      default:
        break;
    }
  }

  return height;
}

function drawRichText(
  page: PDFPage,
  html: string,
  x: number,
  topY: number,
  fonts: Fonts,
  fontSize: number,
  maxWidth: number,
  pageH: number,
  embeddedImages?: Map<string, PDFImage>
): number {
  const richNodes = parseHtml(html);
  let cy = topY;
  const lineH = fontSize * LINE_HEIGHT;
  const paragraphGap = fontSize * 0.5;
  const listIndent = fontSize * 1.8;

  for (const node of richNodes) {
    switch (node.type) {
      case 'paragraph': {
        const text = node.spans
          .map((s) => s.text)
          .join('')
          .trim();
        if (!text) break;
        const font = selectFont(node.spans[0], fonts);
        const isUnderlined = node.spans.some((s) => s.underline);
        const isStrikethrough = node.spans.some((s) => s.strikethrough);
        const lines = wrapText(text, font, fontSize, maxWidth);
        for (const line of lines) {
          drawTextLine(page, line.text, x, cy, font, fontSize, pageH);
          if (isUnderlined) {
            const tw = font.widthOfTextAtSize(line.text, fontSize);
            const underY = cy + fontSize * 1.05;
            drawLine(page, x, underY, x + tw, underY, pageH, {
              width: 0.5 * PX,
            });
          }
          if (isStrikethrough) {
            const tw = font.widthOfTextAtSize(line.text, fontSize);
            const strikeY = cy + fontSize * 0.55;
            drawLine(page, x, strikeY, x + tw, strikeY, pageH, {
              width: 0.5 * PX,
            });
          }
          cy += lineH;
        }
        cy += paragraphGap;
        break;
      }
      case 'listItem': {
        const text = node.spans
          .map((s) => s.text)
          .join('')
          .trim();
        if (!text) break;
        const font = selectFont(node.spans[0], fonts);
        const isUnderlined = node.spans.some((s) => s.underline);
        const isStrikethrough = node.spans.some((s) => s.strikethrough);
        const prefix = node.ordered ? `${node.index}.` : '•';
        const prefixW = fonts.regular.widthOfTextAtSize(prefix, fontSize);
        drawTextLine(
          page,
          prefix,
          x + listIndent - prefixW - 3,
          cy,
          fonts.regular,
          fontSize,
          pageH
        );
        const lines = wrapText(text, font, fontSize, maxWidth - listIndent);
        for (const line of lines) {
          drawTextLine(
            page,
            line.text,
            x + listIndent,
            cy,
            font,
            fontSize,
            pageH
          );
          if (isUnderlined) {
            const tw = font.widthOfTextAtSize(line.text, fontSize);
            drawLine(
              page,
              x + listIndent,
              cy + fontSize * 1.05,
              x + listIndent + tw,
              cy + fontSize * 1.05,
              pageH,
              { width: 0.5 * PX }
            );
          }
          if (isStrikethrough) {
            const tw = font.widthOfTextAtSize(line.text, fontSize);
            drawLine(
              page,
              x + listIndent,
              cy + fontSize * 0.55,
              x + listIndent + tw,
              cy + fontSize * 0.55,
              pageH,
              { width: 0.5 * PX }
            );
          }
          cy += lineH;
        }
        break;
      }
      case 'table': {
        const borderW = PX;
        const cellPad = 0.25 * fontSize;
        const numCols = Math.max(...node.rows.map((r) => r.cells.length));
        const colWidth = (maxWidth - borderW * (numCols + 1)) / numCols;

        // Draw table
        let tableY = cy;
        for (const row of node.rows) {
          const rowH = lineH + 2 * cellPad;
          // Row background for headers
          if (row.cells.some((c) => c.isHeader)) {
            drawRect(page, x, tableY, maxWidth, rowH, pageH, {
              fill: LIGHT_GRAY,
            });
          }
          // Cell borders and text
          for (let ci = 0; ci < row.cells.length; ci += 1) {
            const cell = row.cells[ci];
            const cellX = x + borderW + ci * (colWidth + borderW);
            const cellText = cell.spans
              .map((s) => s.text)
              .join('')
              .trim();
            const cellFont =
              cell.isHeader || cell.spans.some((s) => s.bold)
                ? fonts.bold
                : fonts.regular;
            const isUnderlined = cell.spans.some((s) => s.underline);
            if (cellText) {
              drawTextLine(
                page,
                cellText,
                cellX + cellPad,
                tableY + cellPad,
                cellFont,
                fontSize,
                pageH
              );
              if (isUnderlined) {
                const tw = cellFont.widthOfTextAtSize(cellText, fontSize);
                drawLine(
                  page,
                  cellX + cellPad,
                  tableY + cellPad + fontSize * 1.05,
                  cellX + cellPad + tw,
                  tableY + cellPad + fontSize * 1.05,
                  pageH,
                  { width: 0.5 * PX }
                );
              }
            }
          }
          // Horizontal line below row
          drawLine(page, x, tableY + rowH, x + maxWidth, tableY + rowH, pageH, {
            width: borderW,
          });
          tableY += rowH;
        }
        // Table outline
        drawRect(page, x, cy, maxWidth, tableY - cy, pageH, {
          stroke: BLACK,
          strokeWidth: borderW,
        });
        // Vertical column dividers
        for (let ci = 1; ci < numCols; ci += 1) {
          const divX = x + borderW + ci * (colWidth + borderW) - borderW / 2;
          drawLine(page, divX, cy, divX, tableY, pageH, { width: borderW });
        }
        cy = tableY + paragraphGap;
        break;
      }
      case 'image': {
        // Draw pre-embedded image if available in the image map
        const embeddedImg = embeddedImages?.get(node.src);
        if (embeddedImg) {
          const imgSize = 36;
          const imgX = x;
          page.drawImage(embeddedImg, {
            x: imgX,
            y: pdfY(cy + imgSize, pageH),
            width: imgSize,
            height: imgSize,
          });
          cy += imgSize + paragraphGap;
        }
        break;
      }
      default:
        break;
    }
  }

  return cy - topY;
}

// ─── Tracked Bubble for Grid Extraction ─────────────────────────────────────

interface TrackedBubble {
  centerX: number; // in PDF points from left
  centerY: number; // in PDF points from top (top-down coords)
  optionInfo: OptionInfo;
  pageNumber: number;
}

// ─── Page Geometry Calculator ───────────────────────────────────────────────

interface ContentArea {
  x: number; // left edge of content area in PDF points
  y: number; // top edge in top-down coordinates
  width: number;
  height: number;
}

function computeContentArea(
  pageWidthIn: number,
  pageHeightIn: number
): ContentArea {
  const pageW = pageWidthIn * IN;
  const pageH = pageHeightIn * IN;

  const x = MARGIN_LEFT + TM_W + FRAME_PADDING;
  const y = MARGIN_TOP + TM_H + FRAME_PADDING;
  const width =
    pageW - MARGIN_LEFT - MARGIN_RIGHT - 2 * TM_W - 2 * FRAME_PADDING;
  const height =
    pageH - MARGIN_TOP - MARGIN_BOTTOM - 2 * TM_H - 2 * FRAME_PADDING;

  return { x, y, width, height };
}

// ─── Drawing Helpers ────────────────────────────────────────────────────────

/** Convert top-down Y coordinate to PDF bottom-up Y coordinate */
function pdfY(topDownY: number, pageHeight: number): number {
  return pageHeight - topDownY;
}

function drawRect(
  page: PDFPage,
  x: number,
  topY: number,
  w: number,
  h: number,
  pageH: number,
  options: {
    fill?: Color;
    stroke?: Color;
    strokeWidth?: number;
  } = {}
): void {
  const y = pdfY(topY + h, pageH);
  if (options.fill) {
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      color: options.fill,
    });
  }
  if (options.stroke) {
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      borderColor: options.stroke,
      borderWidth: options.strokeWidth ?? 1,
    });
  }
}

function drawLine(
  page: PDFPage,
  x1: number,
  y1Top: number,
  x2: number,
  y2Top: number,
  pageH: number,
  options: { color?: Color; width?: number } = {}
): void {
  page.drawLine({
    start: { x: x1, y: pdfY(y1Top, pageH) },
    end: { x: x2, y: pdfY(y2Top, pageH) },
    color: options.color ?? BLACK,
    thickness: options.width ?? 1,
  });
}

function drawTextLine(
  page: PDFPage,
  text: string,
  x: number,
  topY: number,
  font: PDFFont,
  fontSize: number,
  pageH: number,
  options: { color?: Color } = {}
): void {
  // PDF drawText y is the baseline. We position from the top of the line box.
  // The baseline is approximately at topY + fontSize (ascent).
  // More precisely, ascent = font.heightAtSize(fontSize, { descender: false })
  const ascent = font.heightAtSize(fontSize, { descender: false });
  page.drawText(text, {
    x,
    y: pdfY(topY + ascent, pageH),
    font,
    size: fontSize,
    color: options.color ?? BLACK,
  });
}

function drawTextBlock(
  page: PDFPage,
  text: string,
  x: number,
  topY: number,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
  pageH: number
): number {
  const lineH = fontSize * LINE_HEIGHT;
  const lines = wrapText(text, font, fontSize, maxWidth);
  let cy = topY;
  for (const line of lines) {
    drawTextLine(page, line.text, x, cy, font, fontSize, pageH);
    cy += lineH;
  }
  return cy - topY; // total height used
}

// ─── Bubble Drawing ─────────────────────────────────────────────────────────

/**
 * Draws a rounded-rectangle bubble matching the CSS shape:
 * width: 19px, height: 13px, border-radius: 7px, border: 1px solid black.
 *
 * Uses bezier curves to approximate quarter-circle arcs at corners, matching
 * the approach in marking.ts.
 */
function drawBubble(
  page: PDFPage,
  x: number,
  topY: number,
  pageH: number,
  filled: boolean = false
): void {
  const w = BUBBLE_W;
  const h = BUBBLE_H;
  const r = 7 * PX; // border-radius: 7px
  // Control point distance for a quarter-circle bezier approximation
  const k = r * ((4 * (Math.sqrt(2) - 1)) / 3);

  // PDF coordinates: bottom-left origin, y up
  const left = x;
  const bottom = pdfY(topY + h, pageH);
  const right = left + w;
  const top = bottom + h;

  // Trace the rounded-rect path clockwise from top-left corner
  page.pushOperators(
    // Start at top-left, after the top-left arc
    moveTo(left + r, top),
    // Top edge → top-right corner
    lineTo(right - r, top),
    appendBezierCurve(right - r + k, top, right, top - r + k, right, top - r),
    // Right edge → bottom-right corner
    lineTo(right, bottom + r),
    appendBezierCurve(
      right,
      bottom + r - k,
      right - r + k,
      bottom,
      right - r,
      bottom
    ),
    // Bottom edge → bottom-left corner
    lineTo(left + r, bottom),
    appendBezierCurve(
      left + r - k,
      bottom,
      left,
      bottom + r - k,
      left,
      bottom + r
    ),
    // Left edge → top-left corner
    lineTo(left, top - r),
    appendBezierCurve(left, top - r + k, left + r - k, top, left + r, top),
    closePath()
  );

  if (filled) {
    page.pushOperators(setFillingGrayscaleColor(0), fill());
  } else {
    page.pushOperators(
      setStrokingGrayscaleColor(0),
      setLineWidth(PX),
      stroke()
    );
  }
}

// ─── Timing Marks Drawing ───────────────────────────────────────────────────

function drawTimingMarks(
  page: PDFPage,
  pageWidthIn: number,
  pageHeightIn: number,
  hidden: boolean
): void {
  if (hidden) return;

  const pageW = pageWidthIn * IN;
  const pageH = pageHeightIn * IN;
  const markCounts = timingMarkCounts({
    width: pageWidthIn,
    height: pageHeightIn,
  });

  // Top row
  const topRowY = MARGIN_TOP;
  for (let i = 0; i < markCounts.x; i += 1) {
    const x =
      MARGIN_LEFT +
      (i / (markCounts.x - 1)) * (pageW - MARGIN_LEFT - MARGIN_RIGHT - TM_W);
    drawRect(page, x, topRowY, TM_W, TM_H, pageH, { fill: BLACK });
  }

  // Bottom row
  const bottomRowY = pageH - MARGIN_BOTTOM - TM_H;
  for (let i = 0; i < markCounts.x; i += 1) {
    const x =
      MARGIN_LEFT +
      (i / (markCounts.x - 1)) * (pageW - MARGIN_LEFT - MARGIN_RIGHT - TM_W);
    drawRect(page, x, bottomRowY, TM_W, TM_H, pageH, { fill: BLACK });
  }

  // Left column
  for (let j = 0; j < markCounts.y; j += 1) {
    const y =
      MARGIN_TOP +
      (j / (markCounts.y - 1)) * (pageH - MARGIN_TOP - MARGIN_BOTTOM - TM_H);
    drawRect(page, MARGIN_LEFT, y, TM_W, TM_H, pageH, { fill: BLACK });
  }

  // Right column
  const rightX = pageW - MARGIN_RIGHT - TM_W;
  for (let j = 0; j < markCounts.y; j += 1) {
    const y =
      MARGIN_TOP +
      (j / (markCounts.y - 1)) * (pageH - MARGIN_TOP - MARGIN_BOTTOM - TM_H);
    drawRect(page, rightX, y, TM_W, TM_H, pageH, { fill: BLACK });
  }
}

// ─── Grid Measurement from Timing Marks ─────────────────────────────────────

function computeGridMeasurements(
  pageWidthIn: number,
  pageHeightIn: number
): GridMeasurements {
  const pageW = pageWidthIn * IN;
  const pageH = pageHeightIn * IN;
  const markCounts = timingMarkCounts({
    width: pageWidthIn,
    height: pageHeightIn,
  });

  const gridLeft = MARGIN_LEFT;
  const gridRight = pageW - MARGIN_RIGHT - TM_W;
  const gridTop = MARGIN_TOP;
  const gridBottom = pageH - MARGIN_BOTTOM - TM_H;

  const originX = gridLeft + TM_W / 2;
  const originY = gridTop + TM_H / 2;

  const columnGap = (gridRight - gridLeft) / (markCounts.x - 1);
  const rowGap = (gridBottom - gridTop) / (markCounts.y - 1);

  return {
    origin: { x: originX, y: originY },
    columnGap,
    rowGap,
    numTimingMarkColumns: markCounts.x,
    numTimingMarkRows: markCounts.y,
  };
}

function bubbleToGridPosition(
  bubble: TrackedBubble,
  grid: GridMeasurements
): { column: number; row: number } {
  return {
    column: (bubble.centerX - grid.origin.x) / grid.columnGap,
    row: (bubble.centerY - grid.origin.y) / grid.rowGap,
  };
}

// ─── Contest Measurement ────────────────────────────────────────────────────

function measureCandidateContest(
  contest: CandidateContest,
  columnWidth: number,
  fonts: Fonts,
  ballotStyle: BallotStyle
): number {
  const innerWidth = columnWidth - 2 * OPTION_PAD_H;
  const textWidth = innerWidth - BUBBLE_W - BUBBLE_GAP;

  // Contest header
  let height = 0;
  // Header background padding
  height += CONTEST_HEADER_PAD;
  // Contest title
  const titleBlock = measureTextBlock(
    contest.title,
    fonts.bold,
    FONT_SIZE_H3,
    innerWidth
  );
  height += titleBlock.height;
  // "Vote for N" text
  const voteForText =
    contest.seats === 1
      ? hmpbStringsCatalog.hmpbVoteFor1
      : (hmpbStringsCatalog as Record<string, string>)[
          `hmpbVoteFor${contest.seats}`
        ] ?? `Vote for up to ${contest.seats}`;
  const voteForBlock = measureTextBlock(
    voteForText,
    fonts.regular,
    FONT_SIZE_BASE,
    innerWidth
  );
  height += voteForBlock.height;
  // Term description if present
  if (contest.termDescription) {
    const termBlock = measureTextBlock(
      contest.termDescription,
      fonts.regular,
      FONT_SIZE_BASE,
      innerWidth
    );
    height += termBlock.height;
  }
  height += CONTEST_HEADER_PAD;

  // Candidate options
  const candidates = getOrderedCandidatesForContestInBallotStyle({
    contest,
    ballotStyle,
  });
  for (const candidate of candidates) {
    height += OPTION_PAD_V; // top padding
    // Candidate name (bold)
    const nameBlock = measureTextBlock(
      candidate.name,
      fonts.bold,
      FONT_SIZE_BASE,
      textWidth
    );
    height += nameBlock.height;
    // Party list (if applicable)
    if (candidate.partyIds && candidate.partyIds.length > 0) {
      height += textHeight(1, FONT_SIZE_BASE);
    }
    height += OPTION_PAD_V; // bottom padding
  }

  // Write-in options
  // CSS: padding: 0.25rem 0.5rem, paddingTop: 0.9rem, borderTop: 1px
  if (contest.allowWriteIns) {
    const writeInPadTop = 0.9 * FONT_SIZE_BASE;
    const writeInPadBottom = 0.25 * FONT_SIZE_BASE;
    for (let i = 0; i < contest.seats; i += 1) {
      height += PX; // border-top
      height += writeInPadTop;
      // Write-in line (1.25rem tall div with border-bottom)
      height += 1.25 * FONT_SIZE_BASE;
      // Write-in label (0.8rem font size)
      height += FONT_SIZE_WRITE_IN_LABEL * LINE_HEIGHT;
      height += writeInPadBottom;
    }
  }

  // Box border (3px top, 1px other sides)
  height += 3 * PX + PX;

  return height;
}

function measureBallotMeasureContest(
  contest: YesNoContest,
  columnWidth: number,
  fonts: Fonts
): number {
  const innerWidth = columnWidth - 2 * OPTION_PAD_H;

  let height = 0;

  // Box border top (3px)
  height += 3 * PX;

  // Contest header
  height += CONTEST_HEADER_PAD;
  const titleBlock = measureTextBlock(
    contest.title,
    fonts.bold,
    FONT_SIZE_H3,
    innerWidth
  );
  height += titleBlock.height;
  height += CONTEST_HEADER_PAD;

  // Description (may contain HTML)
  height += OPTION_PAD_H; // padding
  const isHtml = /<[a-z][\s\S]*>/i.test(contest.description);
  if (isHtml) {
    height += measureRichText(
      contest.description,
      fonts,
      FONT_SIZE_BASE,
      innerWidth
    );
  } else {
    const descBlock = measureTextBlock(
      contest.description,
      fonts.regular,
      FONT_SIZE_BASE,
      innerWidth
    );
    height += descBlock.height;
  }
  height += OPTION_PAD_H;

  // Gap between description and options
  height += 0.25 * FONT_SIZE_BASE;

  // Yes and No options
  for (let i = 0; i < 2; i += 1) {
    height += OPTION_PAD_V;
    height += textHeight(1, FONT_SIZE_BASE);
    height += OPTION_PAD_V;
  }

  // Box border bottom
  height += PX;

  return height;
}

function measureContest(
  contest: AnyContest,
  columnWidth: number,
  fonts: Fonts,
  ballotStyle: BallotStyle
): number {
  switch (contest.type) {
    case 'candidate':
      return measureCandidateContest(contest, columnWidth, fonts, ballotStyle);
    case 'yesno':
      return measureBallotMeasureContest(contest, columnWidth, fonts);
    default:
      throw new Error(`Unknown contest type`);
  }
}

// ─── Contest Drawing ────────────────────────────────────────────────────────

interface DrawContestResult {
  height: number;
  bubbles: TrackedBubble[];
}

function drawCandidateContest(
  page: PDFPage,
  x: number,
  topY: number,
  columnWidth: number,
  contest: CandidateContest,
  fonts: Fonts,
  pageH: number,
  pageNumber: number,
  ballotStyle: BallotStyle,
  election: Election
): DrawContestResult {
  const bubbles: TrackedBubble[] = [];
  const innerWidth = columnWidth - 2 * OPTION_PAD_H;
  const textWidth = innerWidth - BUBBLE_W - BUBBLE_GAP;
  let cy = topY;

  // Box border (top 3px)
  const borderTop = 3 * PX;
  drawRect(page, x, cy, columnWidth, borderTop, pageH, { fill: BLACK });
  cy += borderTop;

  const boxTop = cy;

  // Contest header background
  const headerStartY = cy;
  cy += CONTEST_HEADER_PAD;

  // Contest title
  const titleHeight = drawTextBlock(
    page,
    contest.title,
    x + OPTION_PAD_H,
    cy,
    fonts.bold,
    FONT_SIZE_H3,
    innerWidth,
    pageH
  );
  cy += titleHeight;

  // "Vote for N"
  const voteForText =
    contest.seats === 1
      ? hmpbStringsCatalog.hmpbVoteFor1
      : (hmpbStringsCatalog as Record<string, string>)[
          `hmpbVoteFor${contest.seats}`
        ] ?? `Vote for up to ${contest.seats}`;
  const voteForHeight = drawTextBlock(
    page,
    voteForText,
    x + OPTION_PAD_H,
    cy,
    fonts.regular,
    FONT_SIZE_BASE,
    innerWidth,
    pageH
  );
  cy += voteForHeight;

  // Term description
  if (contest.termDescription) {
    const termHeight = drawTextBlock(
      page,
      contest.termDescription,
      x + OPTION_PAD_H,
      cy,
      fonts.regular,
      FONT_SIZE_BASE,
      innerWidth,
      pageH
    );
    cy += termHeight;
  }

  cy += CONTEST_HEADER_PAD;

  // Header background
  drawRect(page, x, headerStartY, columnWidth, cy - headerStartY, pageH, {
    fill: LIGHT_GRAY,
  });
  // Redraw header text on top of background
  let headerTextY = headerStartY + CONTEST_HEADER_PAD;
  headerTextY += drawTextBlock(
    page,
    contest.title,
    x + OPTION_PAD_H,
    headerTextY,
    fonts.bold,
    FONT_SIZE_H3,
    innerWidth,
    pageH
  );
  headerTextY += drawTextBlock(
    page,
    voteForText,
    x + OPTION_PAD_H,
    headerTextY,
    fonts.regular,
    FONT_SIZE_BASE,
    innerWidth,
    pageH
  );
  if (contest.termDescription) {
    drawTextBlock(
      page,
      contest.termDescription,
      x + OPTION_PAD_H,
      headerTextY,
      fonts.regular,
      FONT_SIZE_BASE,
      innerWidth,
      pageH
    );
  }

  // Candidates
  const candidates = getOrderedCandidatesForContestInBallotStyle({
    contest,
    ballotStyle,
  });

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];

    // Separator line
    if (i > 0) {
      drawLine(page, x, cy, x + columnWidth, cy, pageH, {
        color: DARK_GRAY,
        width: PX,
      });
    }

    cy += OPTION_PAD_V;

    const lineH = FONT_SIZE_BASE * LINE_HEIGHT;

    // Bubble (vertically centered on first line of text)
    const bubbleTopY = cy + (lineH - BUBBLE_H) / 2;
    drawBubble(page, x + OPTION_PAD_H, bubbleTopY, pageH);

    const optionInfo: OptionInfo = {
      type: 'option',
      contestId: contest.id,
      optionId: candidate.id,
      partyIds: candidate.partyIds,
    };
    bubbles.push({
      centerX: x + OPTION_PAD_H + BUBBLE_W / 2,
      centerY: bubbleTopY + BUBBLE_H / 2,
      optionInfo,
      pageNumber,
    });

    // Candidate name
    const nameX = x + OPTION_PAD_H + BUBBLE_W + BUBBLE_GAP;
    const nameHeight = drawTextBlock(
      page,
      candidate.name,
      nameX,
      cy,
      fonts.bold,
      FONT_SIZE_BASE,
      textWidth,
      pageH
    );
    cy += nameHeight;

    // Party list
    if (
      election.type !== 'primary' &&
      candidate.partyIds &&
      candidate.partyIds.length > 0
    ) {
      const partyNames = candidate.partyIds
        .map((pid) => election.parties.find((p) => p.id === pid)?.name ?? '')
        .filter(Boolean)
        .join(', ');
      if (partyNames) {
        drawTextBlock(
          page,
          partyNames,
          nameX,
          cy,
          fonts.regular,
          FONT_SIZE_BASE,
          textWidth,
          pageH
        );
        cy += textHeight(1, FONT_SIZE_BASE);
      }
    }

    cy += OPTION_PAD_V;
  }

  // Write-in options
  // CSS: padding: 0.25rem 0.5rem, paddingTop: 0.9rem, borderTop: 1px
  if (contest.allowWriteIns) {
    const writeInPadTop = 0.9 * FONT_SIZE_BASE;
    const writeInPadBottom = 0.25 * FONT_SIZE_BASE;

    for (
      let writeInIndex = 0;
      writeInIndex < contest.seats;
      writeInIndex += 1
    ) {
      // Border-top separator
      drawLine(page, x, cy, x + columnWidth, cy, pageH, {
        color: DARK_GRAY,
        width: PX,
      });
      cy += PX;

      // Top padding (0.9rem)
      cy += writeInPadTop;

      // The bubble is vertically centered on the write-in line area
      // Position bubble alongside the write-in line
      const lineH = FONT_SIZE_BASE * LINE_HEIGHT;
      const bubbleTopY = cy + (lineH - BUBBLE_H) / 2;
      drawBubble(page, x + OPTION_PAD_H, bubbleTopY, pageH);

      const optionInfo: OptionInfo = {
        type: 'write-in',
        contestId: contest.id,
        writeInIndex,
        writeInArea: { top: 0.8, left: -0.9, bottom: 0.2, right: 8.7 },
      };
      bubbles.push({
        centerX: x + OPTION_PAD_H + BUBBLE_W / 2,
        centerY: bubbleTopY + BUBBLE_H / 2,
        optionInfo,
        pageNumber,
      });

      const writeInX = x + OPTION_PAD_H + BUBBLE_W + BUBBLE_GAP;

      // Write-in line (1.25rem height div with border-bottom)
      const writeInLineBottom = cy + 1.25 * FONT_SIZE_BASE;
      drawLine(
        page,
        writeInX,
        writeInLineBottom,
        x + columnWidth - OPTION_PAD_H,
        writeInLineBottom,
        pageH,
        {
          color: BLACK,
          width: PX,
        }
      );
      cy += 1.25 * FONT_SIZE_BASE;

      // Small gap between line and label (matches CSS block spacing)
      cy += 0.1 * FONT_SIZE_BASE;

      // Write-in label
      drawTextBlock(
        page,
        hmpbStringsCatalog.hmpbWriteIn,
        writeInX,
        cy,
        fonts.regular,
        FONT_SIZE_WRITE_IN_LABEL,
        textWidth,
        pageH
      );
      cy += FONT_SIZE_WRITE_IN_LABEL * LINE_HEIGHT;

      // Bottom padding (0.25rem)
      cy += writeInPadBottom;
    }
  }

  // Box side borders
  const boxHeight = cy - boxTop;
  drawRect(page, x, boxTop, columnWidth, boxHeight, pageH, {
    stroke: BLACK,
    strokeWidth: PX,
  });

  // Bottom border
  cy += PX;

  return { height: cy - topY, bubbles };
}

function drawBallotMeasureContest(
  page: PDFPage,
  x: number,
  topY: number,
  columnWidth: number,
  contest: YesNoContest,
  fonts: Fonts,
  pageH: number,
  pageNumber: number,
  embeddedImages?: Map<string, PDFImage>
): DrawContestResult {
  const bubbles: TrackedBubble[] = [];
  const innerWidth = columnWidth - 2 * OPTION_PAD_H;
  const textWidth = innerWidth - BUBBLE_W - BUBBLE_GAP;
  let cy = topY;

  // Box border top (3px)
  const borderTop = 3 * PX;
  drawRect(page, x, cy, columnWidth, borderTop, pageH, { fill: BLACK });
  cy += borderTop;

  const boxTop = cy;

  // Contest header with background
  const headerStartY = cy;
  cy += CONTEST_HEADER_PAD;
  const titleHeight = drawTextBlock(
    page,
    contest.title,
    x + OPTION_PAD_H,
    cy,
    fonts.bold,
    FONT_SIZE_H3,
    innerWidth,
    pageH
  );
  cy += titleHeight + CONTEST_HEADER_PAD;

  // Draw header background then text
  drawRect(page, x, headerStartY, columnWidth, cy - headerStartY, pageH, {
    fill: LIGHT_GRAY,
  });
  drawTextBlock(
    page,
    contest.title,
    x + OPTION_PAD_H,
    headerStartY + CONTEST_HEADER_PAD,
    fonts.bold,
    FONT_SIZE_H3,
    innerWidth,
    pageH
  );

  // Description (may contain HTML)
  cy += OPTION_PAD_H;
  const isHtml = /<[a-z][\s\S]*>/i.test(contest.description);
  let descHeight: number;
  if (isHtml) {
    descHeight = drawRichText(
      page,
      contest.description,
      x + OPTION_PAD_H,
      cy,
      fonts,
      FONT_SIZE_BASE,
      innerWidth,
      pageH,
      embeddedImages
    );
  } else {
    descHeight = drawTextBlock(
      page,
      contest.description,
      x + OPTION_PAD_H,
      cy,
      fonts.regular,
      FONT_SIZE_BASE,
      innerWidth,
      pageH
    );
  }
  cy += descHeight + OPTION_PAD_H;

  // Gap
  cy += 0.25 * FONT_SIZE_BASE;

  // Yes/No options
  const options = [contest.yesOption, contest.noOption];
  for (const option of options) {
    // Separator
    drawLine(page, x, cy, x + columnWidth, cy, pageH, {
      color: LIGHT_GRAY,
      width: PX,
    });

    cy += OPTION_PAD_V;

    const lineH = FONT_SIZE_BASE * LINE_HEIGHT;
    const bubbleTopY = cy + (lineH - BUBBLE_H) / 2;
    drawBubble(page, x + OPTION_PAD_H, bubbleTopY, pageH);

    const optionInfo: OptionInfo = {
      type: 'option',
      contestId: contest.id,
      optionId: option.id,
    };
    bubbles.push({
      centerX: x + OPTION_PAD_H + BUBBLE_W / 2,
      centerY: bubbleTopY + BUBBLE_H / 2,
      optionInfo,
      pageNumber,
    });

    drawTextBlock(
      page,
      option.label,
      x + OPTION_PAD_H + BUBBLE_W + BUBBLE_GAP,
      cy,
      fonts.bold,
      FONT_SIZE_BASE,
      textWidth,
      pageH
    );
    cy += lineH;

    cy += OPTION_PAD_V;
  }

  // Box borders
  const boxHeight = cy - boxTop;
  drawRect(page, x, boxTop, columnWidth, boxHeight, pageH, {
    stroke: BLACK,
    strokeWidth: PX,
  });
  cy += PX;

  return { height: cy - topY, bubbles };
}

// ─── Header Drawing ─────────────────────────────────────────────────────────

function drawHeader(
  page: PDFPage,
  x: number,
  topY: number,
  width: number,
  pageH: number,
  fonts: Fonts,
  election: Election,
  ballotStyleId: BallotStyleId,
  ballotType: BallotType,
  ballotMode: BallotMode,
  sealImage?: PDFImage
): number {
  const ballotTitles: Record<BallotMode, Record<BallotType, string>> = {
    official: {
      [BallotType.Precinct]: hmpbStringsCatalog.hmpbOfficialBallot,
      [BallotType.Absentee]: hmpbStringsCatalog.hmpbOfficialAbsenteeBallot,
      [BallotType.Provisional]:
        hmpbStringsCatalog.hmpbOfficialProvisionalBallot,
    },
    sample: {
      [BallotType.Precinct]: hmpbStringsCatalog.hmpbSampleBallot,
      [BallotType.Absentee]: hmpbStringsCatalog.hmpbSampleAbsenteeBallot,
      [BallotType.Provisional]: hmpbStringsCatalog.hmpbSampleProvisionalBallot,
    },
    test: {
      [BallotType.Precinct]: hmpbStringsCatalog.hmpbTestBallot,
      [BallotType.Absentee]: hmpbStringsCatalog.hmpbTestAbsenteeBallot,
      [BallotType.Provisional]: hmpbStringsCatalog.hmpbTestProvisionalBallot,
    },
  };

  const sealSize = 5 * FONT_SIZE_BASE; // 5rem = 60pt
  const sealGap = SECTION_GAP;
  const textX = x + sealSize + sealGap;
  const textWidth = width - sealSize - sealGap;

  // Measure text height first for vertical centering (CSS alignItems: center)
  const titleText = ballotTitles[ballotMode][ballotType];
  const party =
    election.type === 'primary'
      ? getPartyForBallotStyle({ election, ballotStyleId })
      : undefined;
  const dateStr = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(election.date.toMidnightDatetimeWithSystemTimezone());
  const locationText = `${election.county.name}, ${election.state}`;

  let textTotalH = 0;
  textTotalH += textHeight(1, FONT_SIZE_H1); // title
  if (party) textTotalH += textHeight(1, FONT_SIZE_H1); // party
  textTotalH += textHeight(1, FONT_SIZE_H2); // election title
  textTotalH += textHeight(1, FONT_SIZE_H2); // date
  textTotalH += textHeight(1, FONT_SIZE_BASE); // location

  const headerH = Math.max(textTotalH, sealSize);
  const textOffsetY = (headerH - textTotalH) / 2;
  const sealOffsetY = (headerH - sealSize) / 2;

  // Draw seal image if available, vertically centered
  if (sealImage) {
    page.drawImage(sealImage, {
      x,
      y: pdfY(topY + sealOffsetY + sealSize, pageH),
      width: sealSize,
      height: sealSize,
    });
  }

  // Draw text, vertically centered
  let cy = topY + textOffsetY;

  cy += drawTextBlock(
    page,
    titleText,
    textX,
    cy,
    fonts.bold,
    FONT_SIZE_H1,
    textWidth,
    pageH
  );
  if (party) {
    cy += drawTextBlock(
      page,
      party.fullName,
      textX,
      cy,
      fonts.bold,
      FONT_SIZE_H1,
      textWidth,
      pageH
    );
  }
  cy += drawTextBlock(
    page,
    election.title,
    textX,
    cy,
    fonts.bold,
    FONT_SIZE_H2,
    textWidth,
    pageH
  );
  cy += drawTextBlock(
    page,
    dateStr,
    textX,
    cy,
    fonts.bold,
    FONT_SIZE_H2,
    textWidth,
    pageH
  );
  drawTextBlock(
    page,
    locationText,
    textX,
    cy,
    fonts.regular,
    FONT_SIZE_BASE,
    textWidth,
    pageH
  );

  return headerH;
}

function measureHeader(
  width: number,
  fonts: Fonts,
  election: Election,
  ballotStyleId: BallotStyleId,
  ballotType: BallotType,
  ballotMode: BallotMode
): number {
  const sealSize = 5 * FONT_SIZE_BASE;
  const sealGap = SECTION_GAP;
  const textWidth = width - sealSize - sealGap;

  let height = 0;

  // Title
  const ballotTitles: Record<BallotMode, Record<BallotType, string>> = {
    official: {
      [BallotType.Precinct]: hmpbStringsCatalog.hmpbOfficialBallot,
      [BallotType.Absentee]: hmpbStringsCatalog.hmpbOfficialAbsenteeBallot,
      [BallotType.Provisional]:
        hmpbStringsCatalog.hmpbOfficialProvisionalBallot,
    },
    sample: {
      [BallotType.Precinct]: hmpbStringsCatalog.hmpbSampleBallot,
      [BallotType.Absentee]: hmpbStringsCatalog.hmpbSampleAbsenteeBallot,
      [BallotType.Provisional]: hmpbStringsCatalog.hmpbSampleProvisionalBallot,
    },
    test: {
      [BallotType.Precinct]: hmpbStringsCatalog.hmpbTestBallot,
      [BallotType.Absentee]: hmpbStringsCatalog.hmpbTestAbsenteeBallot,
      [BallotType.Provisional]: hmpbStringsCatalog.hmpbTestProvisionalBallot,
    },
  };

  height += measureTextBlock(
    ballotTitles[ballotMode][ballotType],
    fonts.bold,
    FONT_SIZE_H1,
    textWidth
  ).height;

  if (election.type === 'primary') {
    const party = getPartyForBallotStyle({ election, ballotStyleId });
    if (party) {
      height += measureTextBlock(
        party.fullName,
        fonts.bold,
        FONT_SIZE_H1,
        textWidth
      ).height;
    }
  }

  height += measureTextBlock(
    election.title,
    fonts.bold,
    FONT_SIZE_H2,
    textWidth
  ).height;

  const dateStr = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(election.date.toMidnightDatetimeWithSystemTimezone());
  height += measureTextBlock(
    dateStr,
    fonts.bold,
    FONT_SIZE_H2,
    textWidth
  ).height;

  const locationText = `${election.county.name}, ${election.state}`;
  height += measureTextBlock(
    locationText,
    fonts.regular,
    FONT_SIZE_BASE,
    textWidth
  ).height;

  // Seal might be taller than text
  const sealH = sealSize + 0.125 * FONT_SIZE_BASE; // marginTop: 0.125rem
  return Math.max(height, sealH);
}

// ─── Instructions Drawing ───────────────────────────────────────────────────

function measureInstructions(width: number, fonts: Fonts): number {
  // CSS grid: gridTemplateColumns: '1fr 7rem 1.9fr 7.5rem'
  // gap: '0.125rem 0.75rem', padding: '0.5rem 0.5rem'
  const pad = 0.5 * FONT_SIZE_BASE; // 6pt
  const colGap = 0.75 * FONT_SIZE_BASE; // 9pt
  const innerW = width - 2 * pad;
  const col2W = 7 * FONT_SIZE_BASE; // 84pt (diagram)
  const col4W = 7.5 * FONT_SIZE_BASE; // 90pt (diagram)
  const frTotal = innerW - col2W - col4W - 3 * colGap; // remaining for 1fr + 1.9fr
  const col1W = frTotal * (1 / 2.9);
  const col3W = frTotal * (1.9 / 2.9);

  // Cell 1: "Instructions" heading + "To Vote:" + vote text
  const leftColH =
    textHeight(1, FONT_SIZE_H2) +
    textHeight(1, FONT_SIZE_BASE) +
    measureTextBlock(
      hmpbStringsCatalog.hmpbInstructionsToVoteText,
      fonts.regular,
      FONT_SIZE_BASE,
      col1W
    ).height;

  // Cell 3: "To Vote for a Write-in:" + write-in text
  const rightColH =
    textHeight(1, FONT_SIZE_BASE) +
    measureTextBlock(
      hmpbStringsCatalog.hmpbInstructionsWriteInText,
      fonts.regular,
      FONT_SIZE_BASE,
      col3W
    ).height;

  // Grid row height = tallest cell
  const gridRowH = Math.max(leftColH, rightColH);

  let height = 0;
  height += 3 * PX; // border-top-width: 3px
  height += pad; // padding top
  height += gridRowH;
  height += pad; // padding bottom
  height += PX; // border bottom

  return height;
}

/**
 * Draws a simplified instruction diagram showing a filled bubble and an
 * empty bubble, matching InstructionsDiagramFillBubble from svg_assets.tsx.
 */
function drawFillBubbleDiagram(
  page: PDFPage,
  x: number,
  topY: number,
  w: number,
  h: number,
  pageH: number
): void {
  const midY = topY + h / 2;
  const bubbleW = 14;
  const bubbleH = 10;
  const gap = 8;
  const totalW = bubbleW * 2 + gap;
  const startX = x + (w - totalW) / 2;

  // Filled bubble (correct mark)
  drawBubble(page, startX, midY - bubbleH / 2, pageH, true);
  // Empty bubble (incorrect)
  drawBubble(page, startX + bubbleW + gap, midY - bubbleH / 2, pageH, false);
}

/**
 * Draws a simplified write-in instruction diagram showing a bubble
 * next to a write-in line, matching InstructionsDiagramWriteIn.
 */
function drawWriteInDiagram(
  page: PDFPage,
  x: number,
  topY: number,
  w: number,
  h: number,
  pageH: number
): void {
  const midY = topY + h / 2;
  const bubbleStartX = x + 8;

  // Bubble
  drawBubble(page, bubbleStartX, midY - BUBBLE_H / 2, pageH, true);

  // Write-in line
  const lineStartX = bubbleStartX + BUBBLE_W + 6;
  const lineEndX = x + w - 8;
  drawLine(page, lineStartX, midY + 4, lineEndX, midY + 4, pageH, {
    color: BLACK,
    width: PX,
  });
}

function drawInstructions(
  page: PDFPage,
  x: number,
  topY: number,
  width: number,
  pageH: number,
  fonts: Fonts
): number {
  const instrHeight = measureInstructions(width, fonts);
  let cy = topY;

  // CSS grid column widths (matching measureInstructions)
  const pad = 0.5 * FONT_SIZE_BASE;
  const colGapInstr = 0.75 * FONT_SIZE_BASE;
  const innerW = width - 2 * pad;
  const col2W = 7 * FONT_SIZE_BASE;
  const col4W = 7.5 * FONT_SIZE_BASE;
  const frTotal = innerW - col2W - col4W - 3 * colGapInstr;
  const col1W = frTotal * (1 / 2.9);
  const col3W = frTotal * (1.9 / 2.9);

  // Box with tinted background and 3px top border
  drawRect(page, x, cy, width, 3 * PX, pageH, { fill: BLACK });
  cy += 3 * PX;

  const boxInnerH = instrHeight - 3 * PX - PX;
  drawRect(page, x, cy, width, boxInnerH, pageH, { fill: LIGHT_GRAY });
  drawRect(page, x, cy, width, boxInnerH, pageH, {
    stroke: BLACK,
    strokeWidth: PX,
  });

  cy += pad;
  const contentStartY = cy;
  const contentH = boxInnerH - 2 * pad;

  // Column 1: "Instructions" heading + "To Vote:" + text
  const col1X = x + pad;
  let col1Y = contentStartY;
  col1Y += drawTextBlock(
    page,
    hmpbStringsCatalog.hmpbInstructions,
    col1X,
    col1Y,
    fonts.bold,
    FONT_SIZE_H2,
    col1W,
    pageH
  );
  col1Y += drawTextBlock(
    page,
    hmpbStringsCatalog.hmpbInstructionsToVoteTitle,
    col1X,
    col1Y,
    fonts.bold,
    FONT_SIZE_BASE,
    col1W,
    pageH
  );
  drawTextBlock(
    page,
    hmpbStringsCatalog.hmpbInstructionsToVoteText,
    col1X,
    col1Y,
    fonts.regular,
    FONT_SIZE_BASE,
    col1W,
    pageH
  );

  // Column 2: Fill bubble diagram (vertically centered)
  const col2X = col1X + col1W + colGapInstr;
  drawFillBubbleDiagram(page, col2X, contentStartY, col2W, contentH, pageH);

  // Column 3: "To Vote for a Write-in:" + text
  const col3X = col2X + col2W + colGapInstr;
  let col3Y = contentStartY;
  col3Y += drawTextBlock(
    page,
    hmpbStringsCatalog.hmpbInstructionsWriteInTitle,
    col3X,
    col3Y,
    fonts.bold,
    FONT_SIZE_BASE,
    col3W,
    pageH
  );
  drawTextBlock(
    page,
    hmpbStringsCatalog.hmpbInstructionsWriteInText,
    col3X,
    col3Y,
    fonts.regular,
    FONT_SIZE_BASE,
    col3W,
    pageH
  );

  // Column 4: Write-in diagram (vertically centered)
  const col4X = col3X + col3W + colGapInstr;
  drawWriteInDiagram(page, col4X, contentStartY, col4W, contentH, pageH);

  return instrHeight;
}

// ─── Footer Drawing ─────────────────────────────────────────────────────────

function measureFooter(): number {
  // QR code row + metadata row
  const qrRowHeight = QR_CODE_H + 2 * PX; // QR slot with border
  const metadataHeight =
    textHeight(1, FONT_SIZE_METADATA) + 0.325 * FONT_SIZE_BASE;
  return qrRowHeight + metadataHeight;
}

/**
 * Draw a filled circle with a right-pointing arrow, matching ArrowRightCircle
 * from svg_assets.tsx. Used in the footer's "continue voting" instruction.
 */
function drawArrowRightCircle(
  page: PDFPage,
  cx: number,
  cy: number,
  radius: number,
  pageH: number
): void {
  // Filled black circle
  const pdfCy = pdfY(cy, pageH);
  page.drawCircle({ x: cx, y: pdfCy, size: radius, color: BLACK });

  // White right-pointing arrow inside the circle
  const arrowSize = radius * 0.5;
  const ax = cx - arrowSize * 0.4;
  const ay = pdfCy;
  page.pushOperators(
    setFillingGrayscaleColor(1), // white
    moveTo(ax, ay + arrowSize),
    lineTo(ax + arrowSize, ay),
    lineTo(ax, ay - arrowSize),
    closePath(),
    fill()
  );
}

function drawFooter(
  page: PDFPage,
  x: number,
  topY: number,
  width: number,
  pageH: number,
  fonts: Fonts,
  election: Election,
  ballotStyleId: BallotStyleId,
  precinctId: string,
  pageNumber: number,
  totalPages?: number
): number {
  let cy = topY;
  const footerGap = SECTION_GAP;

  // QR code slot (placeholder box)
  drawRect(page, x, cy, QR_CODE_W, QR_CODE_H, pageH, {
    stroke: BLACK,
    strokeWidth: PX,
  });

  // Footer box (CSS: FooterBox with fill='tinted', padding: 0.25rem 0.5rem,
  // justify-content: space-between, align-items: center)
  const boxX = x + QR_CODE_W + footerGap;
  const boxWidth = width - QR_CODE_W - footerGap;
  const boxPadH = 0.5 * FONT_SIZE_BASE;

  // Box border (3px top from Box component + 1px sides)
  drawRect(page, boxX, cy, boxWidth, 3 * PX, pageH, { fill: BLACK });
  drawRect(page, boxX, cy + 3 * PX, boxWidth, QR_CODE_H - 3 * PX, pageH, {
    fill: LIGHT_GRAY,
  });
  drawRect(page, boxX, cy, boxWidth, QR_CODE_H, pageH, {
    stroke: BLACK,
    strokeWidth: PX,
  });

  if (totalPages !== undefined) {
    // Left side: page label + number, vertically centered
    const pageLabelH = FONT_SIZE_SMALL * LINE_HEIGHT;
    const pageNumH = FONT_SIZE_H1 * LINE_HEIGHT;
    const pageBlockH = pageLabelH + pageNumH;
    const pageBlockY = cy + (QR_CODE_H - pageBlockH) / 2;

    drawTextLine(
      page,
      hmpbStringsCatalog.hmpbPage,
      boxX + boxPadH,
      pageBlockY,
      fonts.regular,
      FONT_SIZE_SMALL,
      pageH
    );
    drawTextLine(
      page,
      `${pageNumber}/${totalPages}`,
      boxX + boxPadH,
      pageBlockY + pageLabelH,
      fonts.bold,
      FONT_SIZE_H1,
      pageH
    );

    // Right side: voter instruction, vertically centered
    const arrowRadius = FONT_SIZE_BASE; // 2rem diameter = 1rem radius
    if (pageNumber === totalPages) {
      const text = hmpbStringsCatalog.hmpbVotingComplete;
      const tw = fonts.bold.widthOfTextAtSize(text, FONT_SIZE_H3);
      drawTextLine(
        page,
        text,
        boxX + boxWidth - tw - boxPadH,
        cy + (QR_CODE_H - FONT_SIZE_H3) / 2,
        fonts.bold,
        FONT_SIZE_H3,
        pageH
      );
    } else {
      const text =
        pageNumber % 2 === 1
          ? hmpbStringsCatalog.hmpbContinueVotingOnBack
          : hmpbStringsCatalog.hmpbContinueVotingOnNextSheet;
      const tw = fonts.bold.widthOfTextAtSize(text, FONT_SIZE_H3);
      const arrowCx = boxX + boxWidth - boxPadH - arrowRadius;
      const textRightX = arrowCx - arrowRadius - footerGap;
      drawTextLine(
        page,
        text,
        textRightX - tw,
        cy + (QR_CODE_H - FONT_SIZE_H3) / 2,
        fonts.bold,
        FONT_SIZE_H3,
        pageH
      );
      drawArrowRightCircle(
        page,
        arrowCx,
        cy + QR_CODE_H / 2,
        arrowRadius,
        pageH
      );
    }
  }

  cy += QR_CODE_H;

  // Metadata row (CSS: fontSize 8pt, flex space-between, fontWeight bold)
  cy += 0.325 * FONT_SIZE_BASE;

  // Left: ballot hash · election title, date · county, state
  const ballotHash = '0'.repeat(20); // placeholder - real hash comes from QR code injection
  const dateStr = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(election.date.toMidnightDatetimeWithSystemTimezone());
  const leftText = `${ballotHash} · ${election.title}, ${dateStr} · ${election.county.name}, ${election.state}`;
  drawTextLine(page, leftText, x, cy, fonts.bold, FONT_SIZE_METADATA, pageH);

  // Right: precinct · language
  const precinct = election.precincts.find((p) => p.id === precinctId);
  const precinctName = precinct?.name ?? precinctId;
  const rightText = `${precinctName} · ${ballotStyleId} · English`;
  const rightW = fonts.bold.widthOfTextAtSize(rightText, FONT_SIZE_METADATA);
  drawTextLine(
    page,
    rightText,
    x + width - rightW,
    cy,
    fonts.bold,
    FONT_SIZE_METADATA,
    pageH
  );

  cy += textHeight(1, FONT_SIZE_METADATA);

  return cy - topY;
}

// ─── Main Rendering Pipeline ────────────────────────────────────────────────

export interface PdfBallotRenderResult {
  pdf: Uint8Array;
  gridLayout: GridLayout;
}

export async function renderBallotToPdf(
  election: Election,
  ballotProps: BaseBallotProps
): Promise<PdfBallotRenderResult> {
  const { ballotStyleId, precinctId, ballotType, ballotMode } = ballotProps;
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );

  const pageDimensions = ballotPaperDimensions(election.ballotLayout.paperSize);
  const pageW = pageDimensions.width * IN;
  const pageH = pageDimensions.height * IN;

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontKit);

  const fonts: Fonts = {
    regular: await doc.embedFont(robotoRegularTtf),
    bold: await doc.embedFont(robotoBoldTtf),
    italic: await doc.embedFont(robotoItalicTtf),
  };

  // Embed election seal if available
  let sealImage: PDFImage | undefined;
  if (election.seal) {
    try {
      const sealSizePx = 200; // render at 200px for good quality
      const sealPng = await svgToPng(election.seal, sealSizePx, sealSizePx);
      sealImage = await doc.embedPng(sealPng);
    } catch {
      // Seal rendering failed - continue without it
    }
  }

  // Pre-load embedded images from HTML descriptions (e.g. SVG data URIs)
  const embeddedImages = new Map<string, PDFImage>();
  const allContestsForImages = getContests({ election, ballotStyle });
  for (const contest of allContestsForImages) {
    if (contest.type === 'yesno') {
      const imgSrcRegex = /<img[^>]+src="(data:image\/svg\+xml;base64,[^"]+)"/g;
      let imgMatch = imgSrcRegex.exec(contest.description);
      while (imgMatch) {
        const src = imgMatch[1];
        if (!embeddedImages.has(src)) {
          try {
            const base64Data = src.replace('data:image/svg+xml;base64,', '');
            const svgStr = Buffer.from(base64Data, 'base64').toString('utf-8');
            const imgPng = await svgToPng(svgStr, 100, 100);
            embeddedImages.set(src, await doc.embedPng(imgPng));
          } catch {
            // Image rendering failed - skip it
          }
        }
        imgMatch = imgSrcRegex.exec(contest.description);
      }
    }
  }

  const hideTimingMarks = ballotMode === 'sample';
  const contentArea = computeContentArea(
    pageDimensions.width,
    pageDimensions.height
  );
  const grid = computeGridMeasurements(
    pageDimensions.width,
    pageDimensions.height
  );

  // Get contests for this ballot style
  const allContests = getContests({ election, ballotStyle });
  if (allContests.length === 0) {
    throw new Error('No contests assigned to this precinct.');
  }

  // Partition into candidate contests and ballot measure contests
  const contestSections = iter(allContests)
    .partition((contest) => contest.type === 'candidate')
    .filter((section) => section.length > 0);

  // Measure fixed elements
  const headerHeight = measureHeader(
    contentArea.width,
    fonts,
    election,
    ballotStyleId,
    ballotType,
    ballotMode
  );
  const instructionsHeight = measureInstructions(contentArea.width, fonts);
  const footerHeight = measureFooter();

  // Calculate available height for contests on each page
  function availableContestHeight(isFirstPage: boolean): number {
    let available = contentArea.height;
    available -= footerHeight;
    available -= SECTION_GAP; // gap before footer

    if (isFirstPage) {
      available -= headerHeight;
      available -= SECTION_GAP; // gap after header
      available -= instructionsHeight;
      available -= SECTION_GAP; // gap after instructions
    }

    return available;
  }

  // Paginate contests
  interface PageContent {
    sections: Array<{
      numColumns: number;
      columns: Array<Array<{ contest: AnyContest; height: number }>>;
      height: number;
    }>;
    isFirstPage: boolean;
  }

  const pages: PageContent[] = [];
  const remainingSections = [...contestSections];
  let pageIndex = 0;

  while (remainingSections.length > 0) {
    const isFirstPage = pageIndex === 0;
    const maxHeight = availableContestHeight(isFirstPage);
    let heightUsed = 0;
    const pageSections: PageContent['sections'] = [];

    while (remainingSections.length > 0 && heightUsed < maxHeight) {
      const section = assertDefined(remainingSections.shift());
      const numColumns = section[0].type === 'candidate' ? 3 : 2;
      const columnWidth =
        (contentArea.width - COLUMN_GAP * (numColumns - 1)) / numColumns;

      // Measure all contests in this section
      const measuredContests = section.map((contest) => ({
        contest,
        height: measureContest(contest, columnWidth, fonts, ballotStyle),
      }));

      // Layout in columns - wrap sync iterable as async
      const asyncElements: AsyncIterable<{
        contest: AnyContest;
        height: number;
      }> = {
        [Symbol.asyncIterator]() {
          let i = 0;
          return {
            next() {
              if (i < measuredContests.length) {
                const value = measuredContests[i];
                i += 1;
                return Promise.resolve({ value, done: false as const });
              }
              return Promise.resolve({
                value: undefined,
                done: true as const,
              });
            },
          };
        },
      };

      const { columns, height } = await layOutInColumns({
        elements: asyncElements,
        numColumns,
        maxColumnHeight: maxHeight - heightUsed,
        elementGap: COLUMN_GAP,
      });

      const numUsed = columns.flat().length;
      if (numUsed < section.length) {
        remainingSections.unshift(section.slice(numUsed));
      }

      if (height === 0) break;

      heightUsed += height + COLUMN_GAP;
      pageSections.push({
        numColumns,
        columns,
        height,
      });
    }

    if (pageSections.length === 0 && remainingSections.length > 0) {
      throw new Error('Contest too tall to fit on page');
    }

    pages.push({ sections: pageSections, isFirstPage });
    pageIndex += 1;
  }

  // totalPages counts only content pages (not the blank trailing page)
  const totalPages = pages.length;

  // Ensure even number of pages (front/back pairs)
  if (pages.length % 2 === 1) {
    pages.push({ sections: [], isFirstPage: false });
  }

  // Render all pages
  const allBubbles: TrackedBubble[] = [];

  for (let pIdx = 0; pIdx < pages.length; pIdx += 1) {
    const pageContent = pages[pIdx];
    const pageNum = pIdx + 1;
    const pdfPage = doc.addPage([pageW, pageH]);

    // White background
    pdfPage.drawRectangle({
      x: 0,
      y: 0,
      width: pageW,
      height: pageH,
      color: WHITE,
    });

    // Timing marks
    drawTimingMarks(
      pdfPage,
      pageDimensions.width,
      pageDimensions.height,
      hideTimingMarks
    );

    let cy = contentArea.y;

    // Header and instructions on page 1
    if (pageContent.isFirstPage) {
      const hdrH = drawHeader(
        pdfPage,
        contentArea.x,
        cy,
        contentArea.width,
        pageH,
        fonts,
        election,
        ballotStyleId,
        ballotType,
        ballotMode,
        sealImage
      );
      cy += hdrH + SECTION_GAP;

      const instrH = drawInstructions(
        pdfPage,
        contentArea.x,
        cy,
        contentArea.width,
        pageH,
        fonts
      );
      cy += instrH + SECTION_GAP;
    }

    // Draw contest sections
    for (const section of pageContent.sections) {
      const columnWidth =
        (contentArea.width - COLUMN_GAP * (section.numColumns - 1)) /
        section.numColumns;

      for (let colIdx = 0; colIdx < section.columns.length; colIdx += 1) {
        const column = section.columns[colIdx];
        const colX = contentArea.x + colIdx * (columnWidth + COLUMN_GAP);
        let colY = cy;

        for (const item of column) {
          let result: DrawContestResult;
          if (item.contest.type === 'candidate') {
            result = drawCandidateContest(
              pdfPage,
              colX,
              colY,
              columnWidth,
              item.contest,
              fonts,
              pageH,
              pageNum,
              ballotStyle,
              election
            );
          } else {
            result = drawBallotMeasureContest(
              pdfPage,
              colX,
              colY,
              columnWidth,
              item.contest,
              fonts,
              pageH,
              pageNum,
              embeddedImages
            );
          }
          allBubbles.push(...result.bubbles);
          colY += result.height + COLUMN_GAP;
        }
      }

      cy += section.height + COLUMN_GAP;
    }

    // Draw "blank page" message if no contests on this page
    if (pageContent.sections.length === 0 && !pageContent.isFirstPage) {
      const blankMsg = hmpbStringsCatalog.hmpbPageIntentionallyBlank;
      const blankWidth = fonts.bold.widthOfTextAtSize(blankMsg, FONT_SIZE_H1);
      drawTextLine(
        pdfPage,
        blankMsg,
        contentArea.x + (contentArea.width - blankWidth) / 2,
        contentArea.y + contentArea.height / 2 - FONT_SIZE_H1 / 2,
        fonts.bold,
        FONT_SIZE_H1,
        pageH
      );
    }

    // Footer
    const footerY = contentArea.y + contentArea.height - footerHeight;
    drawFooter(
      pdfPage,
      contentArea.x,
      footerY,
      contentArea.width,
      pageH,
      fonts,
      election,
      ballotStyleId,
      precinctId,
      pageNum,
      pageContent.sections.length > 0 || pageContent.isFirstPage
        ? totalPages
        : undefined
    );
  }

  // Build GridLayout from tracked bubbles
  const gridPositions: GridPosition[] = allBubbles.map((bubble) => {
    const coords = bubbleToGridPosition(bubble, grid);
    const side: 'front' | 'back' =
      bubble.pageNumber % 2 === 1 ? 'front' : 'back';
    const positionInfo: {
      sheetNumber: number;
      side: 'front' | 'back';
      column: number;
      row: number;
    } = {
      sheetNumber: Math.ceil(bubble.pageNumber / 2),
      side,
      ...coords,
    };

    switch (bubble.optionInfo.type) {
      case 'option':
        return { ...positionInfo, ...bubble.optionInfo };
      case 'write-in': {
        const { writeInArea } = bubble.optionInfo;
        return {
          ...positionInfo,
          ...bubble.optionInfo,
          writeInArea: {
            x: positionInfo.column - writeInArea.left,
            y: positionInfo.row - writeInArea.top,
            width: writeInArea.left + writeInArea.right,
            height: writeInArea.top + writeInArea.bottom,
          },
        };
      }
      default:
        throw new Error('Unknown option type');
    }
  });

  // Compute optionBoundsFromTargetMark
  // Use the first write-in option if available, otherwise first candidate option
  let optionBoundsFromTargetMark: Outset<number> = {
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  };
  // For now, use a reasonable default based on typical option dimensions
  // This would need refinement to match the browser-rendered bounds exactly
  const writeInBubble = allBubbles.find(
    (b) => b.optionInfo.type === 'write-in'
  );
  if (writeInBubble) {
    // Approximate bounds based on typical write-in option layout
    const optionHeight =
      (0.9 +
        0.5 +
        LINE_HEIGHT +
        1.25 +
        (FONT_SIZE_WRITE_IN_LABEL * LINE_HEIGHT) / FONT_SIZE_BASE +
        0.5) *
      FONT_SIZE_BASE;
    const optionWidth = (contentArea.width - COLUMN_GAP * 2) / 3; // 3-column width
    const bubbleCenterRelX = OPTION_PAD_H + BUBBLE_W / 2;
    const bubbleCenterRelY =
      (0.9 + 0.25) * FONT_SIZE_BASE +
      (FONT_SIZE_BASE * LINE_HEIGHT - BUBBLE_H) / 2 +
      BUBBLE_H / 2;

    optionBoundsFromTargetMark = {
      top: bubbleCenterRelY / grid.rowGap,
      left: bubbleCenterRelX / grid.columnGap,
      right: (optionWidth - bubbleCenterRelX) / grid.columnGap,
      bottom: (optionHeight - bubbleCenterRelY) / grid.rowGap,
    };
  }

  const gridLayout: GridLayout = {
    ballotStyleId,
    gridPositions,
    optionBoundsFromTargetMark,
  };

  const pdfBytes = await doc.save();

  return {
    pdf: pdfBytes,
    gridLayout,
  };
}

/**
 * Renders all ballots for the given props and returns PDFs and an election
 * definition with grid layouts. This is the pdf-lib equivalent of
 * renderAllBallotPdfsAndCreateElectionDefinition.
 */
export async function renderAllBallotPdfs(
  election: Election,
  allBallotProps: BaseBallotProps[]
): Promise<{
  ballotPdfs: Uint8Array[];
  gridLayouts: GridLayout[];
}> {
  const results = await Promise.all(
    allBallotProps.map((props) => renderBallotToPdf(election, props))
  );

  return {
    ballotPdfs: results.map((r) => r.pdf),
    gridLayouts: results.map((r) => r.gridLayout),
  };
}

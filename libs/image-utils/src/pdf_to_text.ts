/* eslint-disable vx/gts-identifiers */
import { iter } from '@votingworks/basics';
import { Buffer } from 'buffer';
import { TextContentItem, getDocument } from 'pdfjs-dist';

/**
 * All the possible operations for an operator list.
 */
enum PDFOps {
  Dependency = 1,
  SetLineWidth = 2,
  SetLineCap = 3,
  SetLineJoin = 4,
  SetMiterLimit = 5,
  SetDash = 6,
  SetRenderingIntent = 7,
  SetFlatness = 8,
  SetGState = 9,
  Save = 10,
  Restore = 11,
  Transform = 12,
  MoveTo = 13,
  LineTo = 14,
  CurveTo = 15,
  CurveTo2 = 16,
  CurveTo3 = 17,
  ClosePath = 18,
  Rectangle = 19,
  Stroke = 20,
  CloseStroke = 21,
  Fill = 22,
  EoFill = 23,
  FillStroke = 24,
  EoFillStroke = 25,
  CloseFillStroke = 26,
  CloseEOFillStroke = 27,
  EndPath = 28,
  Clip = 29,
  EoClip = 30,
  BeginText = 31,
  EndText = 32,
  SetCharSpacing = 33,
  SetWordSpacing = 34,
  SetHScale = 35,
  SetLeading = 36,
  SetFont = 37,
  SetTextRenderingMode = 38,
  SetTextRise = 39,
  MoveText = 40,
  SetLeadingMoveText = 41,
  SetTextMatrix = 42,
  NextLine = 43,
  ShowText = 44,
  ShowSpacedText = 45,
  NextLineShowText = 46,
  NextLineSetSpacingShowText = 47,
  SetCharWidth = 48,
  SetCharWidthAndBounds = 49,
  SetStrokeColorSpace = 50,
  SetFillColorSpace = 51,
  SetStrokeColor = 52,
  SetStrokeColorN = 53,
  SetFillColor = 54,
  SetFillColorN = 55,
  SetStrokeGray = 56,
  SetFillGray = 57,
  SetStrokeRGBColor = 58,
  SetFillRGBColor = 59,
  SetStrokeCMYKColor = 60,
  SetFillCMYKColor = 61,
  ShadingFill = 62,
  BeginInlineImage = 63,
  BeginImageData = 64,
  EndInlineImage = 65,
  PaintXObject = 66,
  MarkPoint = 67,
  MarkPointProps = 68,
  BeginMarkedContent = 69,
  BeginMarkedContentProps = 70,
  EndMarkedContent = 71,
  BeginCompat = 72,
  EndCompat = 73,
  PaintFormXObjectBegin = 74,
  PaintFormXObjectEnd = 75,
  BeginGroup = 76,
  EndGroup = 77,
  // BeginAnnotations = 78,
  // EndAnnotations = 79,
  BeginAnnotation = 80,
  EndAnnotation = 81,
  // PaintJpegXObject = 82,
  PaintImageMaskXObject = 83,
  PaintImageMaskXObjectGroup = 84,
  PaintImageXObject = 85,
  PaintInlineImageXObject = 86,
  PaintInlineImageXObjectGroup = 87,
  PaintImageXObjectRepeat = 88,
  PaintImageMaskXObjectRepeat = 89,
  PaintSolidColorImageMask = 90,
  ConstructPath = 91,
  SetStrokeTransparent = 92,
  SetFillTransparent = 93,
}

// Extend `pdfjs-dist`'s `PDFPageProxy` class to include `getOperatorList`.
declare module 'pdfjs-dist' {
  interface PDFPageProxy {
    getOperatorList(): Promise<PDFOperatorList>;
  }

  interface PDFOperatorList {
    fnArray: PDFOps[];
    argsArray: Array<unknown[]>;
  }
}

// type ConstructPathPart =
//   | [OPS.MoveTo, [x: number, y: number]]
//   | [OPS.LineTo, [x: number, y: number]]
//   | [
//       OPS.CurveTo,
//       [x1: number, y1: number, x2: number, y2: number, x3: number, y3: number],
//     ]
//   | [OPS.CurveTo2, [x2: number, y2: number, x3: number, y3: number]]
//   | [OPS.CurveTo3, [x1: number, y1: number, x3: number, y3: number]]
//   | [OPS.ClosePath, []]
//   | [OPS.Rectangle, [x: number, y: number, width: number, height: number]];

// function* forEachConstructPathOperator(
//   op: OPS,
//   args: unknown[]
// ): Generator<ConstructPathPart> {
//   if (op !== OPS.ConstructPath) {
//     return;
//   }

//   const [subOps, ...subArgsList] = args as [OPS[], ...Array<unknown[]>];
//   for (const [subOp, subArgs] of iter(subOps).zip(subArgsList)) {
//     yield [subOp, subArgs] as ConstructPathPart;
//   }
// }

/**
 * A page of a PDF document.
 */
export interface PdfPageText {
  readonly pageNumber: number;
  readonly pageCount: number;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly textContentItems: TextContentItem[];
  readonly operatorList: import('pdfjs-dist').PDFOperatorList;

  forEachOperator(): Generator<[PDFOps, unknown[]]>;
}

/**
 * Renders PDF pages as images.
 */
export async function* pdfToText(pdfBytes: Buffer): AsyncIterable<PdfPageText> {
  const pdf = await getDocument(pdfBytes).promise;

  // Yes, 1-indexing is correct.
  // https://github.com/mozilla/pdf.js/blob/6ffcedc24bba417694a9d0e15eaf16cadf4dad15/src/display/api.js#L2457-L2463
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    const operatorList = await page.getOperatorList();

    yield {
      pageCount: pdf.numPages,
      pageNumber: i,
      pageWidth: viewport.width,
      pageHeight: viewport.height,
      textContentItems: textContent.items,
      operatorList,

      *forEachOperator() {
        for (const [op, args] of iter(operatorList.fnArray).zip(
          operatorList.argsArray
        )) {
          yield [op, args] as [PDFOps, unknown[]];
        }
      },
    };
  }
}

import type { PDFFont, PDFPage } from 'pdf-lib';
import { assert } from '@votingworks/basics';
import {
  BallotHashSlot,
  Box,
  DualLanguageText,
  PAGE_CLASS,
  QrCodeSlot,
} from '../ballot_components.js';
import { hmpbStrings } from '../hmpb_strings.js';
import { ArrowRightCircle } from '../svg_assets.js';
import type { RenderDocument } from '../renderer.js';

const FOOTER_SLOT_CLASS = 'footer-slot';

export function Footer({
  pageNumber,
  totalPages,
}: {
  pageNumber: number;
  totalPages?: number;
}): JSX.Element {
  const continueVoting = (
    <div
      style={{
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'center',
      }}
    >
      <div style={{ textAlign: 'right' }}>
        <DualLanguageText>
          <h3>
            {pageNumber % 2 === 1
              ? hmpbStrings.hmpbContinueVotingOnBack
              : hmpbStrings.hmpbContinueVotingOnNextSheet}
          </h3>
        </DualLanguageText>
      </div>
      <ArrowRightCircle style={{ height: '2rem' }} />
    </div>
  );
  const ballotComplete = (
    <div style={{ textAlign: 'right' }}>
      <DualLanguageText>
        <h3>{hmpbStrings.hmpbVotingComplete}</h3>
      </DualLanguageText>
    </div>
  );

  let endOfPageInstruction;
  // @coverage-defer
  if (totalPages !== undefined) {
    endOfPageInstruction =
      pageNumber === totalPages ? ballotComplete : continueVoting;
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <QrCodeSlot />
        <Box
          fill="tinted"
          style={{
            padding: '0.25rem 0.5rem',
            flex: 1,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            {totalPages !== undefined && (
              <div>
                <div style={{ fontSize: '0.85rem' }}>
                  <DualLanguageText delimiter="/">
                    {hmpbStrings.hmpbPage}
                  </DualLanguageText>
                </div>
                <h1>
                  {pageNumber}/{totalPages}
                </h1>
              </div>
            )}
          </div>
          {pageNumber % 2 === 1 && <div className={FOOTER_SLOT_CLASS}></div>}
          <div>{endOfPageInstruction}</div>

          {/* <BallotHashSlot> must appear in the document, but we don't want it displayed */}
          <div style={{ display: 'none' }}>
            <BallotHashSlot />
          </div>
        </Box>
      </div>
    </div>
  );
}

export interface PositionPts {
  x: number;
  y: number;
}

const PT_PER_PX = 72 / 96;

/**
 * Screen-space coordinates, in pts, of the center of the footer metadata slot.
 */
export async function getMetaCenter(doc: RenderDocument): Promise<PositionPts> {
  const [slot] = await doc.inspectElements(
    `.${PAGE_CLASS}[data-page-number="1"] .${FOOTER_SLOT_CLASS}`
  );
  assert(slot, 'footer metadata slot not found');

  return {
    x: (slot.x + 0.5 * slot.width) * PT_PER_PX,
    y: (slot.y + 0.5 * slot.height) * PT_PER_PX,
  };
}

/**
 * Draws the footer metadata text, centered at the given coordinates.
 */
export function drawFooterMeta(p: {
  ballotHash: string;
  center: PositionPts;
  font: PDFFont;
  page: PDFPage;
  sheetIndex: number;
}): void {
  const fontSize = 8;
  const gap = 0.75 * fontSize;

  const electionMeta = `Election: ${p.ballotHash}`;
  const cycleMeta = `Cycle Index: ${p.sheetIndex + 1}`;

  const electionMetaWidth = p.font.widthOfTextAtSize(electionMeta, fontSize);
  const cycleMetaWidth = p.font.widthOfTextAtSize(cycleMeta, fontSize);

  const width = electionMetaWidth + gap + cycleMetaWidth;
  const ascent = p.font.heightAtSize(fontSize, { descender: false });

  const pdfSpaceCenterY = p.page.getHeight() - p.center.y;
  const y = pdfSpaceCenterY - 0.5 * ascent;
  let x = p.center.x - 0.5 * width;

  p.page.drawText(electionMeta, { x, y, size: fontSize, font: p.font });
  x += electionMetaWidth + gap;
  p.page.drawText(cycleMeta, { x, y, size: fontSize, font: p.font });
}

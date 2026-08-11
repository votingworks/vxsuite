import { Buffer } from 'node:buffer';

const LETTER_WIDTH_POINTS = 612;
const LETTER_HEIGHT_POINTS = 792;

/**
 * Builds a minimal valid PDF with one page per entry in `pageContents`, each
 * entry being a PDF content stream (empty string for a blank page). Pages are
 * letter-sized. This lets tests synthesize scanner input sheets without
 * depending on ballot fixtures.
 */
function buildPdf(pageContents: string[]): Buffer {
  const objects: string[] = [];
  const pageObjectNumbers = pageContents.map(
    (_, i) => 3 + i * 2 // catalog=1, pages=2, then alternating page/content
  );

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(
    `<< /Type /Pages /Kids [${pageObjectNumbers
      .map((n) => `${n} 0 R`)
      .join(' ')}] /Count ${pageContents.length} >>`
  );
  for (const [i, content] of pageContents.entries()) {
    const pageObjectNumber = pageObjectNumbers[i];
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LETTER_WIDTH_POINTS} ${LETTER_HEIGHT_POINTS}] /Contents ${
        pageObjectNumber + 1
      } 0 R >>`
    );
    objects.push(
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
    );
  }

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const [i, object] of objects.entries()) {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (const offset of offsets) {
    body += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${
    objects.length + 1
  } /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(body, 'ascii');
}

/** A two-page PDF of entirely blank sheets. */
export function makeBlankSheetPdf(): Buffer {
  return buildPdf(['', '']);
}

/**
 * A two-page PDF with dark vertical streaks on each page, simulating the
 * output of a scanner with a dirty image sensor.
 */
export function makeStreakedSheetPdf(): Buffer {
  const streaks = [120, 300, 480]
    .map((x) => `0 0 0 rg ${x} 0 6 ${LETTER_HEIGHT_POINTS} re f`)
    .join(' ');
  return buildPdf([streaks, streaks]);
}

import { Buffer } from 'node:buffer';
import { assert } from '@votingworks/basics';
import { safeParseInt } from '@votingworks/types';

/**
 * Renumbers PDF objects sequentially (in order of first definition) and rebuilds
 * the xref table. Object numbering is an internal structural detail — it
 * affects how the PDF reader locates objects but has no effect on rendered
 * content. Chromium assigns different object numbers depending on page reuse
 * history in the renderer pool, and pdf-lib assigns them based on serialization
 * order. Renumbering makes the output consistent regardless of these factors.
 */
function renumberPdfObjects(str: string): string {
  const oldToNew = new Map<string, number>();
  let nextNum = 1;
  const defRegex = /(\d+) 0 obj/g;
  let match = defRegex.exec(str);
  while (match) {
    if (!oldToNew.has(match[1])) {
      oldToNew.set(match[1], nextNum);
      nextNum += 1;
    }
    match = defRegex.exec(str);
  }

  let result = str.replace(/(\d+) 0 (obj|R)/g, (full, num, suffix) => {
    const newNum = oldToNew.get(num);
    return newNum !== undefined ? `${newNum} 0 ${suffix}` : full;
  });

  result = result.replace(/\/Size \d+/, `/Size ${nextNum}`);

  const offsets = new Map<number, number>();
  const newDefRegex = /(\d+) 0 obj/g;
  match = newDefRegex.exec(result);
  while (match) {
    const num = safeParseInt(match[1]).unsafeUnwrap();
    if (!offsets.has(num)) {
      offsets.set(num, match.index);
    }
    match = newDefRegex.exec(result);
  }

  // Every xref table starts with this entry: object 0, generation 65535,
  // marked free ('f'). It's the head of the free-object linked list per the
  // PDF spec — it will never be allocated as a real object.
  const XREF_FREE_OBJECT_HEADER = '0000000000 65535 f \n';
  const XREF_OFFSET_WIDTH = 10;
  const xrefLines = [XREF_FREE_OBJECT_HEADER];
  for (let i = 1; i < nextNum; i += 1) {
    const offset = offsets.get(i);
    assert(offset !== undefined, `Missing offset for object ${i}`);
    xrefLines.push(
      `${String(offset).padStart(XREF_OFFSET_WIDTH, '0')} 00000 n \n`
    );
  }
  const xrefBody = `xref\n0 ${nextNum}\n${xrefLines.join('')}`;

  result = result.replace(/xref\n[\s\S]*?(?=trailer)/, xrefBody);

  const xrefOffset = result.indexOf('xref\n');
  result = result.replace(/startxref\n\d+/, `startxref\n${xrefOffset}`);

  return result;
}

/**
 * Normalizes a PDF to produce deterministic output. Zeroes non-deterministic
 * metadata (timestamps, document IDs, node IDs), then renumbers objects
 * sequentially and rebuilds the xref table.
 *
 * Idempotent — safe to apply after rendering and again after any
 * transformation (ghostscript, pdf-lib concatenation, etc.).
 */
export function normalizePdf(pdf: Uint8Array): Uint8Array {
  const ZERO_TIMESTAMP = "D:00000000000000+00'00'";
  const ZERO_XMP_DATE = '0000-00-00T00:00:00+00:00';
  const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
  const ZERO_HEX_ID = '0'.repeat(32);
  const CHROMIUM_NODE_ID_WIDTH = 8;

  let str = Buffer.from(pdf).toString('latin1');

  // Chromium embeds the current time in CreationDate/ModDate. These are
  // metadata-only and don't affect rendering or content.
  str = str.replace(
    /\/CreationDate \(D:\d{14}[^)]*\)/g,
    `/CreationDate (${ZERO_TIMESTAMP})`
  );
  str = str.replace(
    /\/ModDate \(D:\d{14}[^)]*\)/g,
    `/ModDate (${ZERO_TIMESTAMP})`
  );

  // Ghostscript uses a slightly different timestamp format (no space before
  // paren). Same rationale — metadata-only, no effect on content.
  str = str.replace(
    /\/CreationDate\(D:\d{14}[^)]*\)/g,
    `/CreationDate(${ZERO_TIMESTAMP})`
  );
  str = str.replace(
    /\/ModDate\(D:\d{14}[^)]*\)/g,
    `/ModDate(${ZERO_TIMESTAMP})`
  );

  // Chromium assigns DOM node IDs (node00000001, etc.) that increment based on
  // page reuse history. These are internal identifiers used in the structure
  // tree for accessibility tagging — they don't affect visual rendering.
  // Re-sequencing them makes the output consistent regardless of page history.
  let counter = 0;
  str = str.replace(
    new RegExp(`node\\d{${CHROMIUM_NODE_ID_WIDTH}}`, 'g'),
    () => {
      counter += 1;
      return `node${String(counter).padStart(CHROMIUM_NODE_ID_WIDTH, '0')}`;
    }
  );

  // The /Names array maps DOM node IDs to PDF structure tree element objects.
  // The mapping depends on the order Chromium emits objects, which varies with
  // page reuse. This is accessibility metadata only — it doesn't affect the
  // visual content of the PDF. Stripping it keeps the output deterministic.
  str = str.replace(/\/Names \[(?:[^\]]*)\]/g, '/Names []');

  // Ghostscript embeds XMP metadata with the current time. These are
  // XML-formatted timestamps in the document metadata stream — no effect on
  // rendered content.
  str = str.replace(
    /<xmp:ModifyDate>[^<]+<\/xmp:ModifyDate>/g,
    `<xmp:ModifyDate>${ZERO_XMP_DATE}</xmp:ModifyDate>`
  );
  str = str.replace(
    /<xmp:CreateDate>[^<]+<\/xmp:CreateDate>/g,
    `<xmp:CreateDate>${ZERO_XMP_DATE}</xmp:CreateDate>`
  );

  // Ghostscript generates a unique document ID per run. This is a metadata
  // identifier used for document tracking — no effect on content.
  str = str.replace(
    /xapMM:DocumentID='uuid:[^']+'/g,
    `xapMM:DocumentID='uuid:${ZERO_UUID}'`
  );

  // Ghostscript generates unique hex /ID pairs per run. These are used for PDF
  // document identification (e.g. by viewers to detect the same document) — no
  // effect on content.
  str = str.replace(
    /\/ID \[<[0-9A-Fa-f]{32}><[0-9A-Fa-f]{32}>\]/g,
    `/ID [<${ZERO_HEX_ID}><${ZERO_HEX_ID}>]`
  );

  str = renumberPdfObjects(str);
  return Uint8Array.from(Buffer.from(str, 'latin1'));
}

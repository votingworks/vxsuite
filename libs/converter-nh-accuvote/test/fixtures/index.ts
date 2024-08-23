import { Buffer } from 'buffer';
import { parseXml } from '../../src/convert/dom_parser';
import { RawCardDefinition } from '../../src/convert/types';
import { PdfReader } from '../../src/pdf_reader';
import { PDF_PPI } from '../../src/proofing';

/**
 * Reads the XML definition and image data for a fixture.
 */
export function readFixtureBallotCardDefinition(
  xml: string,
  ballotPdf: Buffer
): RawCardDefinition {
  return {
    definition: parseXml(xml),
    ballotPdf: new PdfReader(ballotPdf, { scale: 200 / PDF_PPI }),
  };
}

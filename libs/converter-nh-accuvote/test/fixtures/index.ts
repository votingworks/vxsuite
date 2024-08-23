import { Buffer } from 'buffer';
import { parseXml } from '../../src/convert/dom_parser';
import { NewHampshireBallotCardDefinition } from '../../src/convert/types';
import { PdfReader } from '../../src/pdf_reader';
import { PDF_PPI } from '../../src/proofing';

/**
 * Returns a parsed XML document for the given fixture data.
 */
export function readFixtureDefinition(xml: string): Element {
  return parseXml(xml);
}

/**
 * Reads the XML definition and image data for a fixture.
 */
export function readFixtureBallotCardDefinition(
  xml: string,
  ballotPdf: Buffer
): NewHampshireBallotCardDefinition {
  return {
    definitionPath: '(fixture)',
    definition: readFixtureDefinition(xml),
    ballotPdf: new PdfReader(ballotPdf, { scale: 200 / PDF_PPI }),
  };
}

import { DOMParser } from '@xmldom/xmldom';
import { Buffer } from 'buffer';
import { NewHampshireBallotCardDefinition } from '../../src/convert/types';

/**
 * Returns a parsed XML document for the given fixture data.
 */
export function readFixtureDefinition(xml: string): Element {
  return new DOMParser().parseFromString(xml).documentElement;
}

/**
 * Reads the XML definition and image data for a fixture.
 */
export function readFixtureBallotCardDefinition(
  xml: string,
  ballotPdf: Buffer
): NewHampshireBallotCardDefinition {
  return {
    definition: readFixtureDefinition(xml),
    ballotPdf,
  };
}

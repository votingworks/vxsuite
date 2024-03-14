import { ImageData } from '@votingworks/image-utils';
import { DOMParser } from '@xmldom/xmldom';
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
  frontImage: ImageData,
  backImage: ImageData
): NewHampshireBallotCardDefinition {
  return {
    definition: readFixtureDefinition(xml),
    front: frontImage,
    back: backImage,
  };
}

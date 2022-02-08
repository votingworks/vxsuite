import {
  DistrictIdSchema,
  Election,
  err,
  Result,
  safeParse,
  safeParseElection,
} from '@votingworks/types';
import { JSDOM } from 'jsdom';
import { DateTime } from 'luxon';

function parseXml(xml: string): Element {
  const jsdom = new JSDOM(xml, { contentType: 'text/xml' });
  return jsdom.window.document.documentElement;
}

/**
 * Contains the metadata and ballot images for a ballot card.
 */
export interface NewHampshireBallotCardDefinition {
  /**
   * XML string containing the ballot card definition, including election info
   * and contests with candidates.
   */
  readonly metadata: string;

  /**
   * An image of the ballot card's front as rendered from a PDF.
   */
  readonly front: ImageData;

  /**
   * An image of the ballot card's back as rendered from a PDF.
   */
  readonly back: ImageData;
}

/**
 * Convert New Hampshire XML files to a single {@link Election} object.
 */
export function convertElectionDefinition(
  cardDefinitions: readonly NewHampshireBallotCardDefinition[]
): Result<Election, Error> {
  if (cardDefinitions.length < 1) {
    return err(new Error('at least one ballot card definition is required'));
  }

  const root = parseXml(cardDefinitions[0]?.metadata as string);

  const electionId = root.querySelector(
    'AccuvoteHeaderInfo > ElectionID'
  )?.textContent;
  if (typeof electionId !== 'string') {
    return err(new Error('ElectionID is required'));
  }

  const title = root.querySelector(
    'AccuvoteHeaderInfo > ElectionName'
  )?.textContent;
  if (typeof title !== 'string') {
    return err(new Error('ElectionName is required'));
  }

  const townName = root.querySelector(
    'AccuvoteHeaderInfo > TownName'
  )?.textContent;
  if (typeof townName !== 'string') {
    return err(new Error('TownName is required'));
  }

  const townId = root.querySelector('AccuvoteHeaderInfo > TownID')?.textContent;
  if (typeof townId !== 'string') {
    return err(new Error('TownID is required'));
  }

  const rawDate = root.querySelector(
    'AccuvoteHeaderInfo > ElectionDate'
  )?.textContent;
  if (typeof rawDate !== 'string') {
    return err(new Error('ElectionDate is required'));
  }

  const parsedDate = DateTime.fromFormat(rawDate.trim(), 'M/d/yyyy HH:mm:ss', {
    locale: 'en-US',
    zone: 'America/New_York',
  });
  if (parsedDate.invalidReason) {
    return err(new Error(`invalid date: ${parsedDate.invalidReason}`));
  }

  const rawPrecinctId = root.querySelector(
    'AccuvoteHeaderInfo > PrecinctID'
  )?.textContent;
  if (typeof rawPrecinctId !== 'string') {
    return err(new Error('PrecinctID is required'));
  }
  const cleanedPrecinctId = rawPrecinctId.replace(/[^-_\w]/g, '');
  const precinctId = `town-id-${townId}-precinct-id-${cleanedPrecinctId}`;

  const districtIdResult = safeParse(
    DistrictIdSchema,
    `town-id-${townId}-precinct-id-${cleanedPrecinctId}`
  );
  if (districtIdResult.isErr()) {
    return districtIdResult;
  }
  const districtId = districtIdResult.ok();

  const election: Election = {
    title,
    date: parsedDate.toISO(),
    county: {
      id: townId,
      name: townName,
    },
    state: 'NH',
    parties: [],
    precincts: [
      {
        id: precinctId,
        name: townName,
      },
    ],
    districts: [
      {
        id: districtId,
        name: townName,
      },
    ],
    ballotStyles: [
      {
        id: 'default',
        districts: [districtId],
        precincts: [precinctId],
      },
    ],
    contests: [],
  };

  return safeParseElection(election);
}

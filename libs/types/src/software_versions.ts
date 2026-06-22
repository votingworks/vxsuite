import { z } from 'zod/v4';
import { assert, ok, Result } from '@votingworks/basics';
import { sha256 } from 'js-sha256';
import {
  BallotStyle,
  BallotStyleSchema,
  Election,
  ElectionDefinition,
  ElectionSchema,
  JurisdictionSchema,
  PollingPlace,
  PollingPlacesSchema,
} from './election';
import { pollingPlacesGenerateFromPrecincts } from './polling_places';
import { safeParseElectionDefinition } from './election_parsing';
import { safeParse, safeParseJson } from './generic';
import { ElectionStringKey, UiStringsPackage } from './ui_string_translations';

export const SoftwareVersions = ['v4.0', 'v4.1'] as const;
export const LATEST_SOFTWARE_VERSION = 'v4.1';
export type SoftwareVersion = (typeof SoftwareVersions)[number];
export const SoftwareVersionSchema: z.ZodType<SoftwareVersion> =
  z.enum(SoftwareVersions);

// Deprecated election types from v4.0. Retained so that VxDesign can export
// compatible elections for jurisdictions that are still using v4.0 software.
// Can be deleted once all jurisdictions have migrated to v4.1 or later.
const ELECTION_TYPES_V4_0 = ['general', 'primary'] as const;
type ElectionTypeV4p0 = (typeof ELECTION_TYPES_V4_0)[number];
const ElectionTypeSchemaV4p0: z.ZodSchema<ElectionTypeV4p0> =
  z.enum(ELECTION_TYPES_V4_0);

// v4.0 used `county` (and the `countyName` ballot-string key) where v4.1+ uses
// `jurisdiction` (and `jurisdictionName`). Drop `jurisdiction` from the v4.0
// shape and use `county` instead, so VxDesign can export elections compatible
// with deployed v4.0 software.
const { jurisdiction: _jurisdiction, ...electionShapeForV4p0 } =
  ElectionSchema.shape;

// v4.0 treated BallotStyle.languages as optional; v4.1+ requires it. Keep the
// field optional in the v4.0 shape so existing v4.0 elections (which may omit
// it) still parse. convertV4p0ElectionToLatest defaults it to ['en'].
type BallotStyleV4p0 = Omit<BallotStyle, 'languages'> & {
  languages?: readonly string[];
};
const BallotStyleV4p0Schema = BallotStyleSchema.extend({
  languages: z.array(z.string()).optional(),
});

type ElectionV4p0 = Omit<
  Election,
  'type' | 'jurisdiction' | 'ballotStyles' | 'pollingPlaces'
> & {
  type: ElectionTypeV4p0;
  county: Election['jurisdiction'];
  ballotStyles: readonly BallotStyleV4p0[];
  pollingPlaces?: readonly PollingPlace[];
};
export const ElectionV4p0Schema: z.ZodSchema<ElectionV4p0> = z.object({
  ...electionShapeForV4p0,
  ballotStyles: z.array(BallotStyleV4p0Schema),
  pollingPlaces: PollingPlacesSchema.optional(),
  county: JurisdictionSchema,
  type: ElectionTypeSchemaV4p0,
});

/**
 * Renames an election-string key (e.g. `jurisdictionName` <-> `countyName`)
 * across every language in a ballot-strings package, for v4.0 conversion.
 */
function renameBallotStringKey(
  ballotStrings: UiStringsPackage,
  fromKey: string,
  toKey: string
): UiStringsPackage {
  return Object.fromEntries(
    Object.entries(ballotStrings).map(([languageCode, strings]) => {
      if (!(fromKey in strings)) return [languageCode, strings];
      const { [fromKey]: value, ...rest } = strings;
      return [languageCode, { ...rest, [toKey]: value }];
    })
  );
}

export function convertLatestElectionToV4p0(election: Election): ElectionV4p0 {
  assert(
    election.type !== 'open-primary',
    'v4.0 does not support open primaries'
  );
  const { jurisdiction, ballotStrings, ...rest } = election;
  return {
    ...rest,
    county: jurisdiction,
    ballotStrings: renameBallotStringKey(
      ballotStrings,
      ElectionStringKey.JURISDICTION_NAME,
      'countyName'
    ),
    type: election.type === 'general' ? 'general' : 'primary',
  };
}

function convertV4p0ElectionToLatest(election: ElectionV4p0): Election {
  const { county, ballotStrings, ballotStyles, pollingPlaces, ...rest } =
    election;
  return {
    ...rest,
    // v4.0 may omit ballot-style languages; v4.1+ requires them. Default to
    // English when absent.
    ballotStyles: ballotStyles.map((ballotStyle) => ({
      ...ballotStyle,
      languages: ballotStyle.languages ?? ['en'],
    })),
    // v4.0 may omit polling places; v4.1+ requires at least one. Default to a
    // single election-day polling place per precinct when absent.
    pollingPlaces:
      pollingPlaces ??
      pollingPlacesGenerateFromPrecincts(
        election.precincts,
        'election_day',
        (precinct) => `${precinct.id}-polling-place`
      ),
    jurisdiction: county,
    ballotStrings: renameBallotStringKey(
      ballotStrings,
      'countyName',
      ElectionStringKey.JURISDICTION_NAME
    ),
    type: election.type === 'general' ? 'general' : 'closed-primary',
  };
}

type ElectionDefinitionV4p0 = Omit<ElectionDefinition, 'election'> & {
  election: ElectionV4p0;
};

export function safeParseElectionDefinitionV4p0(
  value: string
): Result<ElectionDefinitionV4p0, z.ZodError | SyntaxError> {
  const valueJson = safeParseJson(value);
  if (valueJson.isErr()) return valueJson;
  const election = safeParse(ElectionV4p0Schema, valueJson.ok());
  if (election.isErr()) return election;
  return ok({
    election: election.ok(),
    electionData: value,
    ballotHash: sha256(value),
  });
}

export function safeParseElectionDefinitionForAnySoftwareVersion(
  value: string
): Result<ElectionDefinition, z.ZodError | SyntaxError> {
  const latestResult = safeParseElectionDefinition(value);
  if (latestResult.isOk()) return latestResult;
  const v4p0Result = safeParseElectionDefinitionV4p0(value);
  if (v4p0Result.isOk()) {
    return ok({
      ...v4p0Result.ok(),
      election: convertV4p0ElectionToLatest(v4p0Result.ok().election),
    });
  }
  return latestResult;
}

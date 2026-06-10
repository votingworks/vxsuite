import { z } from 'zod/v4';
import { assert, ok, Result } from '@votingworks/basics';
import { sha256 } from 'js-sha256';
import { Election, ElectionDefinition, ElectionSchema } from './election';
import {
  parseElectionDate,
  safeParseElectionDefinition,
} from './election_parsing';
import { safeParse, safeParseJson } from './generic';

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

type ElectionV4p0 = Omit<Election, 'type'> & { type: ElectionTypeV4p0 };
export const ElectionV4p0Schema: z.ZodSchema<ElectionV4p0> =
  ElectionSchema.extend({
    type: ElectionTypeSchemaV4p0,
  });

export function convertLatestElectionToV4p0(election: Election): ElectionV4p0 {
  assert(
    election.type !== 'open-primary',
    'v4.0 does not support open primaries'
  );
  return {
    ...election,
    type: election.type === 'general' ? 'general' : 'primary',
  };
}

function convertV4p0ElectionToLatest(election: ElectionV4p0): Election {
  return {
    ...election,
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
  const valueWithParsedDate = parseElectionDate(valueJson.ok());
  if (valueWithParsedDate.isErr()) return valueWithParsedDate;
  const election = safeParse(ElectionV4p0Schema, valueWithParsedDate.ok());
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

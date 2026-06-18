import { z } from 'zod/v4';
import { assert, ok, Result } from '@votingworks/basics';
import { sha256 } from 'js-sha256';
import {
  BallotMeasureContest,
  BallotMeasureOption,
  BallotMeasureOptionSchema,
  BallotStyle,
  BallotStyleSchema,
  CandidateContest,
  CandidateContestSchema,
  Contest,
  ContestBase,
  ContestBaseSchema,
  Election,
  ElectionDefinition,
  ElectionSchema,
  JurisdictionSchema,
  StraightPartyContest,
  StraightPartyContestSchema,
} from './election';
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

// v4.0 represented ballot measures as `type: 'yesno'` with discrete
// `yesOption`/`noOption`/`additionalOptions` fields, where v4.1+ uses
// `type: 'measure'` with a single ordered `options` array. Keep the old shape
// in the v4.0 schema so existing v4.0 elections still parse, and convert
// between the two in the conversion functions below.
interface YesNoContestV4p0 extends ContestBase {
  readonly type: 'yesno';
  readonly description: string;
  readonly yesOption: BallotMeasureOption;
  readonly noOption: BallotMeasureOption;
  readonly additionalOptions?: readonly BallotMeasureOption[];
}
const YesNoContestV4p0Schema = ContestBaseSchema.extend({
  type: z.literal('yesno'),
  description: z.string().nonempty(),
  yesOption: BallotMeasureOptionSchema,
  noOption: BallotMeasureOptionSchema,
  additionalOptions: z.array(BallotMeasureOptionSchema).optional(),
});
type ContestV4p0 = CandidateContest | YesNoContestV4p0 | StraightPartyContest;
const ContestV4p0Schema: z.ZodSchema<ContestV4p0> = z.union([
  CandidateContestSchema,
  YesNoContestV4p0Schema,
  StraightPartyContestSchema,
]);

type ElectionV4p0 = Omit<
  Election,
  'type' | 'jurisdiction' | 'ballotStyles' | 'contests'
> & {
  type: ElectionTypeV4p0;
  county: Election['jurisdiction'];
  ballotStyles: readonly BallotStyleV4p0[];
  contests: readonly ContestV4p0[];
};
export const ElectionV4p0Schema: z.ZodSchema<ElectionV4p0> = z.object({
  ...electionShapeForV4p0,
  ballotStyles: z.array(BallotStyleV4p0Schema),
  contests: z.array(ContestV4p0Schema),
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

// v4.1+ ballot measures carry an ordered `options` array. v4.0 requires
// discrete `yesOption`/`noOption` fields, so map the first option to `yesOption`,
// the second to `noOption`, and any remaining options to `additionalOptions`.
function convertMeasureContestToV4p0(
  contest: BallotMeasureContest
): YesNoContestV4p0 {
  const { options, ...rest } = contest;
  const [yesOption, noOption, ...additionalOptions] = options;
  assert(
    yesOption && noOption,
    'v4.0 ballot measures require at least two options'
  );
  return {
    ...rest,
    type: 'yesno',
    yesOption,
    noOption,
    ...(additionalOptions.length > 0 ? { additionalOptions } : {}),
  };
}

// v4.0 ballot measures use discrete `yesOption`/`noOption`/`additionalOptions`
// fields. v4.1+ collapses these into a single ordered `options` array.
function convertYesNoContestToLatest(
  contest: YesNoContestV4p0
): BallotMeasureContest {
  const { yesOption, noOption, additionalOptions, ...rest } = contest;
  return {
    ...rest,
    type: 'measure',
    options: [yesOption, noOption, ...(additionalOptions ?? [])],
  };
}

function convertContestToV4p0(contest: Contest): ContestV4p0 {
  return contest.type === 'measure'
    ? convertMeasureContestToV4p0(contest)
    : contest;
}

function convertContestToLatest(contest: ContestV4p0): Contest {
  return contest.type === 'yesno'
    ? convertYesNoContestToLatest(contest)
    : contest;
}

export function convertLatestElectionToV4p0(election: Election): ElectionV4p0 {
  assert(
    election.type !== 'open-primary',
    'v4.0 does not support open primaries'
  );
  const { jurisdiction, ballotStrings, contests, ...rest } = election;
  return {
    ...rest,
    county: jurisdiction,
    contests: contests.map(convertContestToV4p0),
    ballotStrings: renameBallotStringKey(
      ballotStrings,
      ElectionStringKey.JURISDICTION_NAME,
      'countyName'
    ),
    type: election.type === 'general' ? 'general' : 'primary',
  };
}

function convertV4p0ElectionToLatest(election: ElectionV4p0): Election {
  const { county, ballotStrings, ballotStyles, contests, ...rest } = election;
  return {
    ...rest,
    // v4.0 may omit ballot-style languages; v4.1+ requires them. Default to
    // English when absent.
    ballotStyles: ballotStyles.map((ballotStyle) => ({
      ...ballotStyle,
      languages: ballotStyle.languages ?? ['en'],
    })),
    contests: contests.map(convertContestToLatest),
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

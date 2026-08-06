import { z } from 'zod/v4';
import { assert, assertDefined, ok, Result } from '@votingworks/basics';
import { sha256 } from 'js-sha256';
import {
  BallotStyle,
  BallotStyleId,
  BallotStyleIdSchema,
  BallotStyleSchema,
  CandidateContest,
  CandidateContestSchema,
  Contest,
  ContestBase,
  ContestBaseSchema,
  ContestId,
  ContestIdSchema,
  Election,
  ElectionDefinition,
  ElectionSchema,
  JurisdictionSchema,
  PartyId,
  PartyIdSchema,
  PollingPlace,
  PollingPlacesSchema,
  SheetPositions,
  StraightPartyContest,
  StraightPartyContestSchema,
  YesNoContest,
  YesNoOption,
  YesNoOptionSchema,
} from './election';
import {
  ballotPositionsFromGridPositions,
  flattenBallotPositions,
  gridRectToRect,
  outsetFromOptionPosition,
  DEFAULT_OPTION_BOUNDS_FROM_TARGET_MARK_OUTSET,
  type FlatOptionPosition,
} from './ballot_positions';
import { Outset, OutsetSchema, Rect, RectSchema } from './geometry';
import { pollingPlacesGenerateFromPrecincts } from './polling_places';
import { safeParseElectionDefinition } from './election_parsing';
import { Id, IdSchema, safeParse, safeParseJson } from './generic';
import { ElectionStringKey, UiStringsPackage } from './ui_string_translations';

export const SoftwareVersions = ['v4.0', 'v4.1'] as const;
export const LATEST_SOFTWARE_VERSION = 'v4.1';
export type SoftwareVersion = (typeof SoftwareVersions)[number];
export const SoftwareVersionSchema: z.ZodType<SoftwareVersion> =
  z.enum(SoftwareVersions);

// v4.0 used `county` (and the `countyName` ballot-string key) where v4.1+ uses
// `jurisdiction` (and `jurisdictionName`). Drop `jurisdiction` from the v4.0
// shape and use `county` instead, so VxDesign can export elections compatible
// with deployed v4.0 software.
const { jurisdiction: _jurisdiction, ...electionShapeForV4p0 } =
  ElectionSchema.shape;

// v4.0 stored ballot geometry as a flat `gridLayouts` array on the election
// (one shared `optionBoundsFromTargetMark` outset + flat grid positions). v4.1+
// moves this onto each ballot style as hierarchical `ballotPositions` with
// per-option/contest bounds. Keep the old shape here so VxDesign can export
// elections compatible with deployed v4.0 software, and convert between them.
interface GridPositionOptionV4p0 {
  readonly type: 'option';
  readonly sheetNumber: number;
  readonly side: 'front' | 'back';
  readonly column: number;
  readonly row: number;
  readonly contestId: ContestId;
  readonly optionId: Id;
  readonly partyIds?: readonly PartyId[];
}
interface GridPositionWriteInV4p0 {
  readonly type: 'write-in';
  readonly sheetNumber: number;
  readonly side: 'front' | 'back';
  readonly column: number;
  readonly row: number;
  readonly contestId: ContestId;
  readonly writeInIndex: number;
  readonly writeInArea: Rect;
}
type GridPositionV4p0 = GridPositionOptionV4p0 | GridPositionWriteInV4p0;
interface GridLayoutV4p0 {
  readonly ballotStyleId: BallotStyleId;
  readonly optionBoundsFromTargetMark: Outset;
  readonly gridPositions: readonly GridPositionV4p0[];
}
const GridLayoutV4p0Schema: z.ZodSchema<GridLayoutV4p0> = z.object({
  ballotStyleId: BallotStyleIdSchema,
  optionBoundsFromTargetMark: OutsetSchema,
  gridPositions: z.array(
    z.union([
      z.object({
        type: z.literal('option'),
        sheetNumber: z.number().int().positive(),
        side: z.union([z.literal('front'), z.literal('back')]),
        column: z.number().nonnegative(),
        row: z.number().nonnegative(),
        contestId: ContestIdSchema,
        optionId: IdSchema,
        partyIds: z.array(PartyIdSchema).optional(),
      }),
      z.object({
        type: z.literal('write-in'),
        sheetNumber: z.number().int().positive(),
        side: z.union([z.literal('front'), z.literal('back')]),
        column: z.number().nonnegative(),
        row: z.number().nonnegative(),
        contestId: ContestIdSchema,
        writeInIndex: z.number().int().nonnegative(),
        writeInArea: RectSchema,
      }),
    ])
  ),
});

// v4.0 treated BallotStyle.languages as optional; v4.1+ requires it. v4.0 also
// has no `ballotPositions` (that geometry lived in the election's `gridLayouts`).
type BallotStyleV4p0 = Omit<BallotStyle, 'languages' | 'ballotPositions'> & {
  languages?: readonly string[];
};
const BallotStyleV4p0Schema = BallotStyleSchema.omit({
  ballotPositions: true,
}).extend({
  languages: z.array(z.string()).optional(),
});

// v4.0 represented yesno contests with `yesOption`/`noOption` (plus optional
// `additionalOptions`) rather than the v4.1+ ordered `options` array. Deployed
// v4.0 software still expects this shape, so we convert to/from it on export and
// import.
interface YesNoContestV4p0 extends ContestBase {
  readonly type: 'yesno';
  readonly description: string;
  readonly yesOption: YesNoOption;
  readonly noOption: YesNoOption;
  readonly additionalOptions?: readonly YesNoOption[];
}
const YesNoContestV4p0Schema: z.ZodSchema<YesNoContestV4p0> =
  ContestBaseSchema.extend({
    type: z.literal('yesno'),
    description: z.string().nonempty(),
    yesOption: YesNoOptionSchema,
    noOption: YesNoOptionSchema,
    additionalOptions: z.array(YesNoOptionSchema).optional(),
  });
type ContestV4p0 = CandidateContest | YesNoContestV4p0 | StraightPartyContest;
const ContestV4p0Schema: z.ZodSchema<ContestV4p0> = z.union([
  CandidateContestSchema,
  YesNoContestV4p0Schema,
  StraightPartyContestSchema,
]);

type ElectionV4p0 = Omit<
  Election,
  'jurisdiction' | 'ballotStyles' | 'pollingPlaces' | 'contests'
> & {
  county: Election['jurisdiction'];
  ballotStyles: readonly BallotStyleV4p0[];
  pollingPlaces?: readonly PollingPlace[];
  gridLayouts?: readonly GridLayoutV4p0[];
  contests: readonly ContestV4p0[];
};
export const ElectionV4p0Schema: z.ZodSchema<ElectionV4p0> = z.object({
  ...electionShapeForV4p0,
  ballotStyles: z.array(BallotStyleV4p0Schema),
  pollingPlaces: PollingPlacesSchema.optional(),
  gridLayouts: z.array(GridLayoutV4p0Schema).optional(),
  contests: z.array(ContestV4p0Schema),
  county: JurisdictionSchema,
});

// v4.0 <-> v4.1 geometry conversion helpers.
function gridLayoutV4p0ToBallotPositions(
  gridLayout: GridLayoutV4p0
): SheetPositions[] {
  return ballotPositionsFromGridPositions(
    gridLayout.gridPositions,
    gridLayout.optionBoundsFromTargetMark
  );
}

function optionPositionToGridPositionV4p0(
  flat: FlatOptionPosition
): GridPositionV4p0 {
  const { sheetNumber, side, contestId, option } = flat;
  const base = {
    sheetNumber,
    side,
    contestId,
    column: option.bubbleCenter.column,
    row: option.bubbleCenter.row,
  } as const;
  return option.type === 'write-in'
    ? {
        ...base,
        type: 'write-in',
        writeInIndex: option.writeInIndex,
        writeInArea: gridRectToRect(option.writeInArea),
      }
    : {
        ...base,
        type: 'option',
        optionId: option.optionId,
        ...(option.partyIds ? { partyIds: option.partyIds } : {}),
      };
}

// Recovering an outset from (bounds, bubbleCenter) via arithmetic like
// `(row + height) - row` can accumulate floating-point rounding noise.
// Grid coordinates from the renderer are measured in browser pixels then
// converted to grid units using floats, so the noise can reach ~1e-4 grid
// units even when the source outset was identical across all options.
const OUTSET_EPSILON = 1e-4;

function outsetEqual(a: Outset, b: Outset): boolean {
  return (
    Math.abs(a.top - b.top) < OUTSET_EPSILON &&
    Math.abs(a.left - b.left) < OUTSET_EPSILON &&
    Math.abs(a.right - b.right) < OUTSET_EPSILON &&
    Math.abs(a.bottom - b.bottom) < OUTSET_EPSILON
  );
}

function ballotPositionsToGridLayoutV4p0(
  ballotStyleId: BallotStyleId,
  ballotPositions: readonly SheetPositions[]
): GridLayoutV4p0 {
  const flat = flattenBallotPositions(ballotPositions);
  const firstOption = flat[0]?.option;
  // @coverage-defer
  const optionBoundsFromTargetMark = firstOption
    ? outsetFromOptionPosition(firstOption)
    : DEFAULT_OPTION_BOUNDS_FROM_TARGET_MARK_OUTSET;

  // v4.0 uses a single shared outset for all options. Assert that every option
  // produces the same outset before collapsing — if the renderer ever starts
  // computing distinct per-option bounds, this will fail.
  for (const { option } of flat) {
    assert(
      outsetEqual(outsetFromOptionPosition(option), optionBoundsFromTargetMark),
      `ballotPositions for ballot style '${ballotStyleId}' have non-uniform option bounds, ` +
        `which cannot be losslessly represented in the v4.0 gridLayouts format. ` +
        `Update convertLatestElectionToV4p0 to handle per-option bounds.`
    );
  }

  return {
    ballotStyleId,
    optionBoundsFromTargetMark,
    gridPositions: flat.map(optionPositionToGridPositionV4p0),
  };
}

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
      // @coverage-defer
      if (!(fromKey in strings)) return [languageCode, strings];
      const { [fromKey]: value, ...rest } = strings;
      return [languageCode, { ...rest, [toKey]: value }];
    })
  );
}

/**
 * v4.0 doesn't support yesno contests with more than two options, so convert
 * them to candidate contests (one candidate per option) for backwards-compatible
 * export. The description is dropped, since candidate contests don't have one.
 */
export function convertBallotMeasureWithAdditionalOptionsToCandidateContest(
  contest: YesNoContest
): CandidateContest {
  assert(contest.options.length > 2);
  return {
    type: 'candidate',
    id: contest.id,
    districtId: contest.districtId,
    title: contest.title,
    candidates: contest.options.map((option) => ({
      id: option.id,
      name: option.label,
    })),
    allowWriteIns: false,
    seats: 1,
  };
}

export function convertLatestElectionToV4p0(election: Election): ElectionV4p0 {
  const { jurisdiction, ballotStrings, ballotStyles, ...rest } = election;
  // v4.0 represents yesno contests with `yesOption`/`noOption` and doesn't
  // support more than two options, so 2-option measures map to that shape and
  // measures with additional options convert to candidate contests. v4.1+
  // exports them natively as an `options` array.
  const contestsWithAdditionalOptions = election.contests.filter(
    (contest): contest is YesNoContest =>
      contest.type === 'yesno' && contest.options.length > 2
  );
  const contestsForV4p0 = election.contests.map((contest): ContestV4p0 => {
    if (contest.type !== 'yesno') {
      return contest;
    }
    if (contest.options.length > 2) {
      return convertBallotMeasureWithAdditionalOptionsToCandidateContest(
        contest
      );
    }
    const [yesOption, noOption] = contest.options;
    const { options: _options, ...contestRest } = contest;
    return { ...contestRest, yesOption, noOption };
  });
  // Converting to a candidate contest drops the yesno description, so preserve
  // it in additionalHashInput. Otherwise two elections differing only in a
  // ballot-measure description would produce identical v4.0 JSON and collide.
  const additionalHashInput =
    contestsWithAdditionalOptions.length > 0
      ? {
          ...(election.additionalHashInput ?? {}),
          contestDescriptionsForContestsWithAdditionalOptions:
            Object.fromEntries(
              contestsWithAdditionalOptions.map((contest) => [
                contest.id,
                contest.description,
              ])
            ),
        }
      : election.additionalHashInput;
  // v4.1+ stores ballot geometry as `ballotPositions` on each ballot style;
  // v4.0 stores it as a flat `gridLayouts` array on the election.
  const gridLayouts = ballotStyles
    .filter((ballotStyle) => ballotStyle.ballotPositions)
    .map((ballotStyle) =>
      ballotPositionsToGridLayoutV4p0(
        ballotStyle.id,

        assertDefined(ballotStyle.ballotPositions)
      )
    );
  return {
    ...rest,
    contests: contestsForV4p0,
    additionalHashInput,
    county: jurisdiction,
    ballotStyles: ballotStyles.map(
      ({ ballotPositions: _ballotPositions, ...ballotStyle }) => ballotStyle
    ),
    gridLayouts: gridLayouts.length > 0 ? gridLayouts : undefined,
    ballotStrings: renameBallotStringKey(
      ballotStrings,
      ElectionStringKey.JURISDICTION_NAME,
      'countyName'
    ),
  };
}

function convertV4p0ElectionToLatest(election: ElectionV4p0): Election {
  const {
    county,
    ballotStrings,
    ballotStyles,
    pollingPlaces,
    gridLayouts,
    ...rest
  } = election;
  // v4.0 stores ballot geometry as a flat `gridLayouts` array on the election;
  // v4.1+ moves it onto each ballot style as `ballotPositions`.
  const ballotPositionsByStyleId = new Map<BallotStyleId, SheetPositions[]>(
    (gridLayouts ?? []).map((gridLayout) => [
      gridLayout.ballotStyleId,
      gridLayoutV4p0ToBallotPositions(gridLayout),
    ])
  );
  // v4.0 represents yesno contests with `yesOption`/`noOption` (plus optional
  // `additionalOptions`); v4.1+ uses a single ordered `options` array.
  const contests = rest.contests.map((contest): Contest => {
    if (contest.type !== 'yesno') {
      return contest;
    }
    const { yesOption, noOption, additionalOptions, ...contestRest } = contest;
    return {
      ...contestRest,
      options: [yesOption, noOption, ...(additionalOptions ?? [])],
    };
  });
  return {
    ...rest,
    contests,
    // v4.0 may omit ballot-style languages; v4.1+ requires them. Default to
    // English when absent.
    ballotStyles: ballotStyles.map((ballotStyle) => ({
      ...ballotStyle,
      languages: ballotStyle.languages ?? ['en'],
      ...(ballotPositionsByStyleId.has(ballotStyle.id)
        ? { ballotPositions: ballotPositionsByStyleId.get(ballotStyle.id) }
        : {}),
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

import {
  BallotStyle,
  CandidateContest,
  District,
  Election,
  HmpbBallotPaperSize,
  Party,
  PrecinctWithoutSplits,
  safeParse,
  safeParseInt,
} from '@votingworks/types';
import { readFileSync } from 'node:fs';
import { z } from 'zod/v4';
import {
  assert,
  assertDefined,
  DateWithoutTime,
  unique,
} from '@votingworks/basics';
import { generateId } from '../src/utils';

const CandidateNameSchema = z.object({
  Name: z.string(),
  Pronunciation: z.string(),
  CX: z.number(),
  CY: z.number(),
  OX: z.number(),
  OY: z.number(),
  City: z.string(),
  State: z.string(),
});

const WriteInSchema = z.object({
  OX: z.number(),
  OY: z.number(),
  City: z.string(),
  State: z.string(),
});

const OfficeNameSchema = z.object({
  Name: z.string(),
  Pronunciation: z.string(),
  CX: z.number(),
  CY: z.number(),
  WinnerNote: z.string(),
});

const CandidateSchema = z.object({
  OfficeName: OfficeNameSchema,
  CandidateName: z
    .union([CandidateNameSchema, z.array(CandidateNameSchema)])
    .optional(),
  WriteIn: z.union([WriteInSchema, z.array(WriteInSchema)]),
});

const HeaderInfoSchema = z.object({
  ElectionDate: z.string(),
  ElectionName: z.string(),
  TownName: z.string(),
  WardName: z.union([z.string(), z.number()]),
  PartyName: z.string(),
  // eslint-disable-next-line vx/gts-identifiers
  TownID: z.string(),
  // eslint-disable-next-line vx/gts-identifiers
  PrecinctID: z.string(),
  // eslint-disable-next-line vx/gts-identifiers
  ElectionID: z.string(),
  BallotType: z.string(),
  BallotSize: z.string(),
});

const AvsInterfaceSchema = z.object({
  HeaderInfo: HeaderInfoSchema,
  Candidates: z.array(CandidateSchema),
});

export const NhBallotStyleSchema = z.object({
  fileType: z.string(),
  version: z.string(),
  encoding: z.string(),
  // eslint-disable-next-line vx/gts-identifiers
  AVSInterface: AvsInterfaceSchema,
});

export type NhBallotStyle = z.infer<typeof NhBallotStyleSchema>;

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function convertNhElection(nhBallotStyles: NhBallotStyle[]): Election {
  // Parse date from format: AUGUST 21, 2025
  const dates = unique(
    nhBallotStyles.map(
      (ballotStyle) => ballotStyle.AVSInterface.HeaderInfo.ElectionDate
    )
  );
  assert(dates.length === 1);
  const date = new DateWithoutTime(
    new Date(dates[0]).toISOString().split('T')[0]
  );

  const electionNames = unique(
    nhBallotStyles.map(
      (ballotStyle) => ballotStyle.AVSInterface.HeaderInfo.ElectionName
    )
  );
  assert(electionNames.length === 1);
  const title = toTitleCase(electionNames[0]);

  const townNames = unique(
    nhBallotStyles.map(
      (ballotStyle) => ballotStyle.AVSInterface.HeaderInfo.TownName
    )
  );
  assert(townNames.length === 1);
  const townName = toTitleCase(townNames[0]);

  const partyNames = unique(
    nhBallotStyles.map(
      (ballotStyle) => ballotStyle.AVSInterface.HeaderInfo.PartyName
    )
  );
  assert(partyNames.length === 1);
  const partyName = toTitleCase(partyNames[0]);
  const party: Party = {
    id: generateId(),
    name: partyName,
    fullName: `${partyName} Party`,
    abbrev: partyName.charAt(0).toUpperCase(),
  };

  const districtsByName = new Map<string, District>();
  const precinctsByName = new Map<string, PrecinctWithoutSplits>();
  const contestsByTitle = new Map<string, CandidateContest>();

  for (const nhBallotStyle of nhBallotStyles) {
    const { HeaderInfo, Candidates } = nhBallotStyle.AVSInterface;

    const districtsForBallotStyle = [];

    for (const contestInfo of Candidates) {
      const contestTitle = contestInfo.OfficeName.Name;

      const districtName = contestTitle;
      const district = districtsByName.get(districtName) ?? {
        id: generateId(),
        name: districtName,
      };
      districtsByName.set(districtName, district);
      districtsForBallotStyle.push(district.id);

      const seats =
        contestInfo.OfficeName.WinnerNote === 'Vote for not more than 1'
          ? 1
          : safeParseInt(
              assertDefined(
                contestInfo.OfficeName.WinnerNote.match(
                  /^Vote for up to (\d+);\w+ will be elected$/
                )
              )[1]
            ).unsafeUnwrap();

      const existingContest = contestsByTitle.get(contestTitle);
      if (existingContest) {
        assert(existingContest.seats === seats);
      }

      const candidateInfos = Array.isArray(contestInfo.CandidateName)
        ? contestInfo.CandidateName
        : contestInfo.CandidateName
        ? [contestInfo.CandidateName]
        : [];

      const contest = existingContest ?? {
        id: generateId(),
        type: 'candidate',
        title: contestTitle,
        districtId: district.id,
        partyId: party.id,
        allowWriteIns: contestInfo.WriteIn !== undefined,
        seats,
        candidates: candidateInfos.map((candidateInfo) => ({
          id: generateId(),
          name: candidateInfo.Name,
        })),
      };
      contestsByTitle.set(contestTitle, contest);
    }

    const precinctName = HeaderInfo.WardName
      ? `Ward ${HeaderInfo.WardName}`
      : townName;
    const precinct = precinctsByName.get(precinctName) ?? {
      id: generateId(),
      name: precinctName,
      districtIds: [],
    };
    precinctsByName.set(precinctName, {
      ...precinct,
      districtIds: unique([
        ...precinct.districtIds,
        ...districtsForBallotStyle,
      ]),
    });
  }

  const districts = [...districtsByName.values()];
  const precincts = [...precinctsByName.values()];
  const parties = [party];
  const contests = [...contestsByTitle.values()];

  const precinct = precincts[0];
  const ballotStyle: BallotStyle = {
    id: 'ballot-style-1',
    groupId: 'ballot-style-group-1',
    precincts: [precinct.id],
    districts: precinct.districtIds,
    partyId: party.id,
  };

  return {
    id: generateId(),
    type: 'primary',
    title,
    date,
    state: 'NH',
    county: {
      id: generateId(),
      name: townName,
    },
    seal: '',
    districts,
    precincts,
    parties,
    contests,
    ballotStyles: [ballotStyle],
    ballotLayout: {
      paperSize: HmpbBallotPaperSize.Letter,
      metadataEncoding: 'qr-code',
    },
    ballotStrings: {},
  };
}

const USAGE = `Usage: convert_nh_election nh-ballot-style.json...`;
function main(args: readonly string[]): void {
  if (args.length < 1) {
    console.error(USAGE);
    process.exit(1);
  }

  const nhBallotStyles = args.map((electionPath) =>
    safeParse<NhBallotStyle>(
      NhBallotStyleSchema,
      JSON.parse(readFileSync(electionPath, 'utf-8'))
    ).unsafeUnwrap()
  );

  const election = convertNhElection(nhBallotStyles);
  process.stdout.write(JSON.stringify(election, null, 2));
  process.stdout.write('\n');
}

main(process.argv.slice(2));

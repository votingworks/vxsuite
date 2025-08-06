import {
  CandidateContest,
  District,
  Election,
  ElectionId,
  hasSplits,
  HmpbBallotPaperSize,
  Precinct,
  safeParseInt,
} from '@votingworks/types';
import { parse } from 'csv-parse/sync';
import { readdirSync, readFileSync } from 'node:fs';
import {
  assert,
  assertDefined,
  DateWithoutTime,
  find,
} from '@votingworks/basics';
import { join } from 'node:path';
import { generateId } from '../src/utils';

export function createElectionSkeleton(id: ElectionId): Election {
  return {
    id,
    type: 'general',
    title: 'MI Demo Election',
    date: DateWithoutTime.today(),
    state: 'MI',
    county: {
      id: generateId(),
      name: 'Demo County',
    },
    seal: '',
    districts: [],
    precincts: [],
    contests: [],
    parties: [],
    ballotStyles: [],
    ballotLayout: {
      paperSize: HmpbBallotPaperSize.Letter,
      metadataEncoding: 'qr-code',
    },
    ballotStrings: {},
  };
}

function trimLeadingZeros(str: string): string {
  return str.replace(/^0+/, '');
}

function getContestTitle(row: {
  contestTitle1: string;
  contestTitle2: string;
}): string {
  return `${row.contestTitle1} ${row.contestTitle2}`;
}

function districtNameFromContestTitle(contestTitle: string): string {
  return `District for Contest: ${contestTitle}`;
}

const OFFICE_FILE_COLUMNS = [
  'officeName',
  'votesAllowed',
  'unknown',
  'isSpecialElection',
  'blank',
  'contestTitle1',
  'contestTitle2',
  'officeNumber',
] as const;
type OfficeFileRow = Record<(typeof OFFICE_FILE_COLUMNS)[number], string>;

const CANDIDATE_FILE_COLUMNS = [
  'lastName',
  'firstName',
  'candidateNumber',
  'party',
  'race',
  'ballotOrderNumber',
  'contestTitle1',
  'contestTitle2',
  'candidateNumberWithLeadingZeros',
] as const;
type CandidateFileRow = Record<(typeof CANDIDATE_FILE_COLUMNS)[number], string>;

const PRECINCT_FILE_COLUMNS = [
  'wardNumber',
  'precinctNumber',
  'precinctSplitLetter',
  'wardAndPrecinctNumber',
  'ballotStyleNumber',
  'contestTitle1',
  'contestTitle2',
  'parishWardAndPrecinctNumber',
] as const;
type PrecinctFileRow = Record<(typeof PRECINCT_FILE_COLUMNS)[number], string>;

function convertToElection(
  officeFileContents: string,
  candidateFileContents: string,
  precinctFileContents: string
): Election {
  const officeFileRows: OfficeFileRow[] = parse(officeFileContents, {
    columns: [...OFFICE_FILE_COLUMNS],
    skipEmptyLines: true,
    delimiter: ';',
    ignore_last_delimiters: true,
    relaxQuotes: true,
    trim: true,
  });

  const votesAllowedByContestTitle = new Map<string, number>();
  for (const row of officeFileRows) {
    const contestTitle = getContestTitle(row);
    const votesAllowed = safeParseInt(row.votesAllowed).unsafeUnwrap();
    votesAllowedByContestTitle.set(contestTitle, votesAllowed);
  }

  const candidateFileRows: CandidateFileRow[] = parse(candidateFileContents, {
    columns: [...CANDIDATE_FILE_COLUMNS],
    skipEmptyLines: true,
    delimiter: ';',
    ignore_last_delimiters: true,
    relaxQuotes: true,
    trim: true,
  });

  const candidateContests = new Map<string, CandidateContest>();
  const districts = new Map<string, District>();

  for (const row of candidateFileRows) {
    // Create a district for each contest
    // TODO can we do better and merge these later?
    const contestTitle = getContestTitle(row);
    const districtName = districtNameFromContestTitle(contestTitle);
    const district = districts.get(districtName) ?? {
      id: generateId(),
      name: districtName,
    };
    districts.set(districtName, district);
    const contest = candidateContests.get(contestTitle) ?? {
      id: generateId(),
      title: contestTitle,
      type: 'candidate',
      candidates: [],
      districtId: district.id,
      seats: assertDefined(
        votesAllowedByContestTitle.get(contestTitle),
        `Votes allowed not found for contest: ${contestTitle}`
      ),
      allowWriteIns: false,
    };
    candidateContests.set(contestTitle, {
      ...contest,
      candidates: [
        ...contest.candidates,
        {
          id: generateId(),
          lastName: row.lastName,
          firstName: row.firstName,
          name: `${row.firstName} ${row.lastName}`,
          // TODO partyId
        },
      ],
    });
  }

  const precinctFileRows: PrecinctFileRow[] = parse(precinctFileContents, {
    columns: [...PRECINCT_FILE_COLUMNS],
    skipEmptyLines: true,
    delimiter: ';',
    ignore_last_delimiters: true,
    relaxQuotes: true,
    trim: true,
  });

  const precincts = new Map<string, Precinct>();

  // Each row represents the assignment of a single contest to a precinct or split.
  for (const row of precinctFileRows) {
    const precinctName = `Ward ${trimLeadingZeros(
      row.wardNumber
    )}, Precinct ${trimLeadingZeros(row.precinctNumber)}`;

    const district = districts.get(
      districtNameFromContestTitle(getContestTitle(row))
    );
    assert(
      district,
      `District not found for contest in precinct file: ${getContestTitle(row)}`
    );

    const existingPrecinct = precincts.get(precinctName);
    if (existingPrecinct) {
      if (hasSplits(existingPrecinct)) {
        const splitName = `${precinctName} - Split ${row.precinctSplitLetter}`;
        const matchingSplit = existingPrecinct.splits.find(
          (split) => split.name === splitName
        );
        precincts.set(precinctName, {
          ...existingPrecinct,
          splits: matchingSplit
            ? existingPrecinct.splits.map((split) =>
                split.id === matchingSplit.id
                  ? {
                      ...split,
                      districtIds: [...split.districtIds, district.id],
                    }
                  : split
              )
            : [
                ...existingPrecinct.splits,
                {
                  id: generateId(),
                  name: splitName,
                  districtIds: [district.id],
                },
              ],
        });
      }
    } else {
      precincts.set(
        precinctName,
        row.precinctSplitLetter
          ? {
              id: generateId(),
              name: precinctName,
              splits: [
                {
                  id: generateId(),
                  name: `${precinctName} - Split ${row.precinctSplitLetter}`,
                  districtIds: [district.id],
                },
              ],
            }
          : {
              id: generateId(),
              name: precinctName,
              districtIds: [district.id],
            }
      );
    }
  }

  const electionPrecincts = Array.from(precincts.values());
  const electionDistricts = Array.from(districts.values());
  const electionContests = Array.from(candidateContests.values());
  return {
    ...createElectionSkeleton(generateId()),
    precincts: electionPrecincts,
    districts: electionDistricts,
    contests: electionContests,
    // At least one ballot style is required, so we create a dummy
    ballotStyles: [
      {
        id: generateId(),
        groupId: generateId(),
        districts: [electionDistricts[0].id],
        precincts: [electionPrecincts[0].id],
      },
    ],
  };
}

const USAGE = `Usage: convert_la_election election-data-directory`;
function main(args: readonly string[]): void {
  if (args.length !== 1) {
    console.error(USAGE);
    process.exit(1);
  }

  const electionDataDirectory = args[0];
  const electionFileNames = readdirSync(electionDataDirectory).filter(
    (fileName) => fileName.endsWith('.txt')
  );

  const officeFileName = find(electionFileNames, (fileName) =>
    fileName.includes('MO-OR')
  );
  const officeFileContents = readFileSync(
    join(electionDataDirectory, officeFileName),
    'utf-8'
  );

  const candidateFileName = find(electionFileNames, (fileName) =>
    fileName.includes('CAND')
  );
  const candidateFileContents = readFileSync(
    join(electionDataDirectory, candidateFileName),
    'utf-8'
  );

  const precinctFileName = find(electionFileNames, (fileName) =>
    fileName.includes('PCT-DR')
  );
  const precinctFileContents = readFileSync(
    join(electionDataDirectory, precinctFileName),
    'utf-8'
  );

  const election = convertToElection(
    officeFileContents,
    candidateFileContents,
    precinctFileContents
  );
  process.stdout.write(JSON.stringify(election, null, 2));
  process.stdout.write('\n');
}

main(process.argv.slice(2));

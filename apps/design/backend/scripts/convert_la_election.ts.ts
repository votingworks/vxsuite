import {
  AnyContest,
  District,
  Election,
  ElectionId,
  hasSplits,
  HmpbBallotPaperSize,
  Precinct,
} from '@votingworks/types';
import { parse } from 'csv-parse/sync';
import { readdirSync, readFileSync } from 'node:fs';
import { DateWithoutTime, find } from '@votingworks/basics';
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

const knownAbbreviations = ['ISD', 'ESA', 'ESD'];

function toTitleCase(str: string): string {
  return str
    .split(' ')
    .map((word) => {
      if (knownAbbreviations.includes(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function trimLeadingZeros(str: string): string {
  return str.replace(/^0+/, '');
}

function convertToElection(
  precinctFileContents: string,
  candidateFileContents: string
): Election {
  const precinctFileRows = parse(precinctFileContents, {
    columns: [
      'wardNumber',
      'precinctNumber',
      'precinctSplitLetter',
      'wardAndPrecinctNumber',
      'ballotStyleNumber',
      'contestTitle1',
      'contestTitle2',
      'parishWardAndPrecinctNumber',
    ],
    skipEmptyLines: true,
    delimiter: ';',
    ignore_last_delimiters: true,
    relaxQuotes: true,
    trim: true,
  });

  const districts = new Map<string, District>();
  const precincts = new Map<string, Precinct>();
  const contests = new Map<string, AnyContest>();

  // Each row represents the assignment of a single contest to a precinct or split.
  for (const row of precinctFileRows) {
    const precinctName = `Ward ${trimLeadingZeros(
      row.wardNumber
    )}, Precinct ${trimLeadingZeros(row.precinctNumber)}`;

    // Create a district for each contest
    // TODO can we do better and merge these later?
    const contestTitle = `${row.contestTitle1} ${row.contestTitle2}`;
    const districtName = `District for Contest: ${contestTitle}`;
    const district = districts.get(districtName) ?? {
      id: generateId(),
      name: districtName,
    };
    districts.set(districtName, district);

    const contest: AnyContest = contests.get(contestTitle) ?? {
      id: generateId(),
      title: contestTitle,
      type: 'candidate',
      candidates: [],
      districtId: district.id,
      seats: 1,
      allowWriteIns: false,
    };
    contests.set(contestTitle, contest);

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
  const electionContests = Array.from(contests.values());
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

  const precinctFileName = find(electionFileNames, (fileName) =>
    fileName.includes('PCT-DR')
  );
  const precinctFileContents = readFileSync(
    join(electionDataDirectory, precinctFileName),
    'utf-8'
  );

  const candidateFileName = find(electionFileNames, (fileName) =>
    fileName.includes('CAND')
  );
  const candidateFileContents = readFileSync(
    join(electionDataDirectory, candidateFileName),
    'utf-8'
  );

  const election = convertToElection(
    precinctFileContents,
    candidateFileContents
  );
  process.stdout.write(JSON.stringify(election, null, 2));
  process.stdout.write('\n');
}

main(process.argv.slice(2));

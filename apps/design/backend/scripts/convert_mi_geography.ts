import {
  District,
  Election,
  ElectionId,
  HmpbBallotPaperSize,
  Precinct,
} from '@votingworks/types';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';
import { DateWithoutTime } from '@votingworks/basics';
import { generateId } from '../src/utils';

export function createBlankElection(id: ElectionId): Election {
  return {
    id,
    type: 'general',
    title: '',
    date: DateWithoutTime.today(),
    state: '',
    county: {
      id: 'county-id',
      name: '',
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

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function trimLeadingZeros(str: string): string {
  return str.replace(/^0+/, '');
}

function convertToBlankElectionWithGeography(inputFilePath: string): Election {
  const rows = parse(inputFilePath, {
    columns: (header) => header.map(toTitleCase),
    groupColumnsByName: true,
    skipEmptyLines: true,
  });

  const districts = new Map<string, District>();
  const precinctsToDistricts = new Map<string, District[]>();

  for (const row of rows) {
    const precinct = `${toTitleCase(row['Jurisdiction'])} ${toTitleCase(
      trimLeadingZeros(row['Precinct'])
    )}`;
    // The rest of the columns are district names
    for (const [key, value] of Object.entries<string>(row)) {
      if (key === 'Jurisdiction' || key === 'Precinct') continue;
      // Some column names are duplicated and thus grouped during parsing, so we
      // may have multiple values for the same key.
      const values = typeof value === 'string' ? [value] : value;
      if (values) {
        for (const districtValue of values) {
          const includeKey = ![
            'School District',
            'Intermediate School District',
            'Community College',
            'District Library',
            'Authority',
          ].includes(key);
          const districtName = `${includeKey ? `${key} ` : ''}${toTitleCase(
            trimLeadingZeros(districtValue)
          )}`;
          const district = districts.get(districtName) ?? {
            id: generateId(),
            name: districtName,
          };
          districts.set(districtName, district);
          precinctsToDistricts.set(precinct, [
            ...(precinctsToDistricts.get(precinct) ?? []),
            district,
          ]);
        }
      }
    }
  }

  return {
    ...createBlankElection(generateId()),
    precincts: [...precinctsToDistricts.entries()].map(
      // eslint-disable-next-line @typescript-eslint/no-shadow
      ([precinct, districts]): Precinct => ({
        id: generateId(),
        name: precinct,
        districtIds: districts.map((district) => district.id),
      })
    ),
    districts: Array.from(districts.values()),
  };
}

const USAGE = `Usage: convert_mi_geography vrdb-export.csv`;
function main(args: readonly string[]): void {
  if (args.length !== 1) {
    console.error(USAGE);
    process.exit(1);
  }

  const inputFilePath = args[0];
  const inputFileContents = readFileSync(inputFilePath, 'utf-8');
  const election = convertToBlankElectionWithGeography(inputFileContents);
  process.stdout.write(JSON.stringify(election, null, 2));
  process.stdout.write('\n');
}

main(process.argv.slice(2));

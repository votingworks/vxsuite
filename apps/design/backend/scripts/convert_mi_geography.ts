import {
  District,
  Election,
  ElectionId,
  hasSplits,
  HmpbBallotPaperSize,
  Precinct,
} from '@votingworks/types';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';
import { DateWithoutTime } from '@votingworks/basics';
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

function convertToBlankElectionWithGeography(inputFilePath: string): Election {
  const rows = parse(inputFilePath, {
    columns: (header) => header.map(toTitleCase),
    groupColumnsByName: true,
    skipEmptyLines: true,
  });

  const districts = new Map<string, District>();
  // TODO handle precinct splits when two rows have the same precinct but different districts
  const precincts = new Map<string, Precinct>();

  for (const row of rows) {
    const precinctName = `${toTitleCase(row['Jurisdiction'])} ${toTitleCase(
      trimLeadingZeros(row['Precinct'])
    )}`;
    // The rest of the columns are district names, including the Jurisdiction column itself
    const precinctDistricts = Object.entries<string>(row)
      .filter(([header]) => header !== 'Precinct')
      .flatMap(([header, value]) => {
        // Some column names are duplicated and thus grouped during parsing, so we
        // may have multiple values for the same key.
        if (!value) return [];
        const rawDistrictNames = typeof value === 'string' ? [value] : value;
        return rawDistrictNames
          .filter((rawDistrictName) => Boolean(rawDistrictName))
          .map((rawDistrictName) => {
            const includeDistrictType = ![
              'Jurisdiction',
              'Village',
              'School District',
              'Intermediate School District',
              'Community College',
              'District Library',
              'Authority',
            ].includes(header);
            const districtType = includeDistrictType ? `${header} ` : '';
            const districtName = `${districtType}${toTitleCase(
              trimLeadingZeros(rawDistrictName)
            )}`;
            const district = districts.get(districtName) ?? {
              id: generateId(),
              name: districtName,
            };
            districts.set(districtName, district);
            return district;
          });
      });
    // If two rows have the same precinct but different districts,
    // create a precinct split
    const existingPrecinct = precincts.get(precinctName);
    if (existingPrecinct) {
      const existingSplits = hasSplits(existingPrecinct)
        ? existingPrecinct.splits
        : [
            {
              id: generateId(),
              name: `${existingPrecinct.name} - Split 1`,
              districtIds: existingPrecinct.districtIds,
            },
          ];
      precincts.set(precinctName, {
        id: existingPrecinct.id,
        name: existingPrecinct.name,
        splits: [
          ...existingSplits,
          {
            id: generateId(),
            name: `${existingPrecinct.name} - Split ${
              existingSplits.length + 1
            }`,
            districtIds: precinctDistricts.map((district) => district.id),
          },
        ],
      });
    } else {
      precincts.set(precinctName, {
        id: generateId(),
        name: precinctName,
        districtIds: precinctDistricts.map((district) => district.id),
      });
    }
  }

  const electionPrecincts = Array.from(precincts.values());
  const electionDistricts = Array.from(districts.values());
  return {
    ...createElectionSkeleton(generateId()),
    precincts: electionPrecincts,
    districts: electionDistricts,
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

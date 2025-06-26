/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { safeParseInt } from '@votingworks/types';
import fs from 'node:fs';
import { assertDefined } from '@votingworks/basics';
import { stringify } from 'csv-stringify/sync';

interface IO {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

const streetNames = [
  'Main St',
  'High St',
  'Maple Ave',
  'Oak St',
  'Pine St',
  'Elm St',
  'Cedar St',
  'Birch St',
  'Walnut St',
  'Willow St',
  'Sunset Blvd',
  'Broadway',
  'Center Ave',
  'Hillcrest Drive',
  'River Road',
  'Lakeside Drive',
  'Park Lane',
  'Spruce St',
  'Cherry Lane',
  'Magnolia Blvd',
  'Elmwood Ave',
  'Forest Drive',
  'Crescent St',
  'Meadow Lane',
  'Garden Path',
  'Bayview Blvd',
  'Ridge Road',
  'Crystal Way',
  'Waterfront Dr',
  'Pinecone Ln',
  'Granite St',
  'Evergreen Terrace',
  'Sycamore Ave',
  'Bayshore Blvd',
  'Stonewall Rd',
  'Redwood Dr',
  'Heritage Ln',
  'Sunrise Blvd',
  'Victory Ave',
  'Sierra Rd',
];

const firstNames = [
  'John',
  'Jane',
  'Michael',
  'Emily',
  'Chris',
  'Jessica',
  'David',
  'Sarah',
  'James',
  'Ashley',
  'Robert',
  'Amanda',
  'Taylor',
  'Caroline',
  'Benjamin',
  'Jonah',
  'Andrew',
  'Matthew',
  'Mark',
  'Helena',
  'Parvati',
  'Luna',
  'Hermione',
  'Jeremey',
  'Cirie',
  'Aubry',
  'Tony',
  'Natalie',
  'Sandra',
  'Kim',
  'Denise',
  'Sophie',
  'Tommy',
  'Michele',
  'Adam',
  'Nick',
  'Wendell',
  'Domenick',
  'Laurel',
  'Chrissy',
  'Kristen',
  'Kristin',
  'Laura',
  'Megan',
  'Hannah',
  'Olivia',
  'Sophia',
  'Isabella',
  'Mia',
  'Charlotte',
  'Amelia',
  'Harper',
  'Evelyn',
  'Abigail',
  'Ella',
  'Avery',
  'Scarlett',
  'Grace',
  'Chloe',
  'Victoria',
  'Riley',
  'Ethan',
  'Noah',
  'Mason',
  'Logan',
  'Lucas',
  'Liam',
  'Oliver',
  'Elijah',
  'Zachary',
  'Gabriel',
  'Samuel',
  'Julian',
  'Aiden',
  'Harrison',
  'Leah',
  'Lucy',
  'Stella',
  'Henry',
  'Jack',
  'Owen',
  'Caleb',
  'Isaac',
  'Aurora',
  'Madison',
  'Chase',
  'Jordan',
  'Connor',
  'Elise',
];

const lastNames = [
  'Smith',
  'Johnson',
  'Williams',
  'Brown',
  'Jones',
  'Garcia',
  'Miller',
  'Davis',
  'Rodriguez',
  'Martinez',
  'Hernandez',
  'Lopez',
  'Gonzalez',
  'Wilson',
  'Anderson',
  'Thomas',
  'Taylor',
  'Moore',
  'Jackson',
  'Martin',
  'Lee',
  'Perez',
  'Thompson',
  'White',
  'Harris',
  'Sanchez',
  'Clark',
  'Ramirez',
  'Lewis',
  'Robinson',
  'Walker',
  'Young',
  'Allen',
  'King',
  'Wright',
  'Scott',
  'Torres',
  'Nguyen',
  'Hill',
  'Flores',
  'Green',
  'Adams',
  'Nelson',
  'Baker',
  'Hall',
  'Rivera',
  'Campbell',
  'Mitchell',
  'Carter',
  'Roberts',
  'Evans',
  'Turner',
  'Phillips',
  'Campbell',
  'Parker',
  'Edwards',
  'Collins',
  'Murphy',
  'Bell',
  'Bennett',
  'Reed',
  'Cook',
  'Morgan',
  'Gray',
  'Bailey',
  'Long',
  'Rice',
  'Cooper',
  'Peterson',
  'Perry',
  'Howell',
  'Sullivan',
  'Wood',
  'Russell',
  'Ortiz',
  'Jenkins',
  'Brooks',
];

const citiesInNh = [
  { city: 'Concord', zip: '03301' },
  { city: 'Manchester', zip: '03101' },
  { city: 'Nashua', zip: '03060' },
  { city: 'Portsmouth', zip: '03801' },
  { city: 'Keene', zip: '03431' },
  { city: 'Dover', zip: '03820' },
  { city: 'Laconia', zip: '03246' },
  { city: 'Claremont', zip: '03743' },
  { city: 'Berlin', zip: '03570' },
  { city: 'Lebanon', zip: '03766' },
  { city: 'Hooksett', zip: '03106' },
  { city: 'Salem', zip: '03079' },
  { city: 'Enfield', zip: '03441' },
  { city: 'Hudson', zip: '03051' },
  { city: 'Epping', zip: '03042' },
];

function getRandomElement(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

// Helper function: returns a random integer between min and max (inclusive)
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper function: generate a low and high range based on side (ODD, EVEN, or ALL)
function generateRangeForSide(side: 'ODD' | 'EVEN' | 'ALL'): {
  low: number;
  high: number;
} {
  let low = randomInt(1, 20);
  const increment = randomInt(2, 50);
  if (side === 'ODD' || side === 'EVEN') {
    // Adjust low to have proper parity.
    if (
      (side === 'ODD' && low % 2 === 0) ||
      (side === 'EVEN' && low % 2 !== 0)
    ) {
      low += 1;
    }
    // Ensure high has same parity.
    let high = low + increment;
    if (
      (side === 'ODD' && high % 2 === 0) ||
      (side === 'EVEN' && high % 2 !== 0)
    ) {
      high += 1;
    }
    return { low, high };
  }
  // For 'ALL', no parity restrictions.
  return { low, high: low + increment };
}

function getRandomCity(): { city: string; zip: string } {
  return citiesInNh[Math.floor(Math.random() * citiesInNh.length)]!;
}

interface StreetMapping {
  street: string;
  side: 'ODD' | 'EVEN' | 'ALL';
  low: number;
  high: number;
  city: string;
  zip: string;
  district: string;
}

// Generate an array of street mappings from streetNames
function generateStreetMappings(
  mode: 'town' | 'city',
  numPrecincts?: number
): StreetMapping[] {
  const mappings: StreetMapping[] = [];
  for (const street of streetNames) {
    const option = randomInt(1, 4);
    const district =
      mode === 'town' ? '1' : randomInt(1, numPrecincts || 1).toString();

    if (option === 3) {
      for (const side of ['ODD', 'EVEN'] as Array<'ODD' | 'EVEN'>) {
        const { low, high } = generateRangeForSide(side);
        const { city, zip } = getRandomCity();
        mappings.push({ street, side, low, high, city, zip, district });
      }
    } else {
      const side: 'ODD' | 'EVEN' | 'ALL' =
        option === 1 ? 'ODD' : option === 2 ? 'EVEN' : 'ALL';
      const { low, high } = generateRangeForSide(side);
      const { city, zip } = getRandomCity();
      mappings.push({ street, side, low, high, city, zip, district });
    }
  }
  return mappings;
}

// Helper: generate a valid street number within mapping's range and parity.
function getValidStreetNumber(mapping: StreetMapping): number {
  let num = randomInt(mapping.low, mapping.high);
  if (mapping.side === 'ODD' && num % 2 === 0) {
    num = num < mapping.high ? num + 1 : num - 1;
  } else if (mapping.side === 'EVEN' && num % 2 !== 0) {
    num = num < mapping.high ? num + 1 : num - 1;
  }
  return num;
}

// Update generateVoter to accept a mappings array and mode.
function generateVoter(
  id: number,
  mappings: StreetMapping[],
  mode: 'town' | 'city'
): Record<string, string> {
  const mapping = mappings[randomInt(0, mappings.length - 1)]!;
  const streetNumber = getValidStreetNumber(mapping);
  const baseVoter: Record<string, string> = {
    'Voter ID': id.toString(),
    'Last Name': getRandomElement(lastNames).toUpperCase(),
    Suffix: '',
    'First Name': getRandomElement(firstNames).toUpperCase(),
    'Middle Name': getRandomElement(firstNames).toUpperCase(),
    'Street Number': streetNumber.toString(),
    'Address Suffix': '',
    'House Fraction Number': '',
    'Street Name': mapping.street.toUpperCase(),
    'Apartment / Unit Number': '',
    'Address Line 2': '',
    'Address Line 3': '',
    'Postal City / Town': mapping.city.toUpperCase(),
    State: 'NH',
    'Postal Zip 5': mapping.zip,
    'Zip +4': '',
    'Mailing Street Number': '',
    'Mailing Suffix': '',
    'Mailing House Fraction Number': '',
    'Mailing Street Name': '',
    'Mailing Apartment / Unit Number': '',
    'Mailing Address Line 2': '',
    'Mailing Address Line 3': '',
    'Mailing City / Town': '',
    'Mailing State': '',
    'Mailing Zip 5': '',
    'Mailing Zip +4': '',
    Party: 'UND',
  };

  // Add either District or Ward column based on mode
  if (mode === 'town') {
    return { ...baseVoter, District: mapping.district };
  }
  return { ...baseVoter, Ward: mapping.district };
}

// Update generateVoters to accept mappings and mode as parameters.
function generateVoters(
  numVoters: number,
  mappings: StreetMapping[],
  mode: 'town' | 'city'
): Array<Record<string, string>> {
  const voters = [];
  for (let i = 1; i <= numVoters; i += 1) {
    voters.push(generateVoter(i, mappings, mode));
  }
  return voters;
}

// Update generateStreetCsv to use the mappings array and mode.
function generateStreetCsv(
  mappings: StreetMapping[],
  mode: 'town' | 'city'
): string {
  const districtColumnName = mode === 'town' ? 'District' : 'Ward';
  const header = `Low Range,High Range,Side,Street Name,Postal City,Zip 5,Zip 4,${districtColumnName},School Dist,Village Dist,US Cong,Exec Counc,State Sen,State Rep,State Rep Flot,County Name,County Comm Dist`;
  const rows: string[] = [header];
  for (const m of mappings) {
    rows.push(
      `${m.low},${m.high},${m.side},"${m.street}",${m.city},${m.zip},,${m.district},40,N/A,2,5,11,43,37,HILLSBOROUGH,"3RD HILLSBRGH"`
    );
  }
  return rows.join('\n');
}

// eslint-disable-next-line vx/gts-jsdoc
export function main(argv: readonly string[], { stdout, stderr }: IO): number {
  if (argv.length < 5 || argv.length > 7) {
    stderr.write(
      'Usage: generate-voters NUM_VOTERS MODE <output-path> [outputStreetPath] [numPrecincts]\n' +
        'MODE: "town" (District=1) or "city" (Ward=random 1-numPrecincts)\n' +
        'numPrecincts: Required for city mode, ignored for town mode\n'
    );
    return 1;
  }

  const numVotersToGenerate = safeParseInt(assertDefined(argv[2])).okOrElse(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_) => {
      stderr.write('NUM_VOTERS must be a number\n');
      return 1;
    }
  );

  const mode = assertDefined(argv[3]);
  if (mode !== 'town' && mode !== 'city') {
    stderr.write('MODE must be "town" or "city"\n');
    return 1;
  }

  const outputPath = assertDefined(argv[4]);

  let numPrecincts: number | undefined;
  if (mode === 'city') {
    if (argv.length < 6) {
      stderr.write('numPrecincts is required for city mode\n');
      return 1;
    }
    const precinctsArg = argv.length === 6 ? argv[5] : argv[6];
    numPrecincts = safeParseInt(assertDefined(precinctsArg)).okOrElse(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (_) => {
        stderr.write('numPrecincts must be a number\n');
        return 1;
      }
    );
    if (numPrecincts < 1) {
      stderr.write('numPrecincts must be at least 1\n');
      return 1;
    }
  }

  // Generate street mappings with mode and optional numPrecincts.
  const streetMappings = generateStreetMappings(mode, numPrecincts);

  const voters = generateVoters(numVotersToGenerate, streetMappings, mode);
  const csvData = stringify(voters, { header: true });
  fs.writeFileSync(outputPath, csvData);
  stdout.write(
    `Generated ${numVotersToGenerate} voters and saved to ${outputPath}\n`
  );

  // If outputStreetPath is provided, generate and write the street names CSV.
  const outputStreetPath =
    argv.length >= 6 && (mode === 'town' || argv.length === 7)
      ? mode === 'town'
        ? argv[5]
        : argv[5]
      : undefined;

  if (outputStreetPath) {
    const streetCsv = generateStreetCsv(streetMappings, mode);
    fs.writeFileSync(outputStreetPath, streetCsv);
    stdout.write(
      `Generated street names CSV and saved to ${outputStreetPath}\n`
    );
  }

  return 0;
}

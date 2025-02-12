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

function getRandomElement(arr: string[]): string {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function generateVoter(id: number): Record<string, string> {
  return {
    'Voter ID': id.toString(),
    'Last Name': getRandomElement(lastNames).toUpperCase(),
    Suffix: '',
    'First Name': getRandomElement(firstNames).toUpperCase(),
    'Middle Name': getRandomElement(firstNames).toUpperCase(),
    'Street Number': (Math.floor(Math.random() * 9999) + 1).toString(),
    'Address Suffix': '',
    'House Fraction Number': '',
    'Street Name': getRandomElement(streetNames).toUpperCase(),
    'Apartment / Unit Number': '',
    'Address Line 2': '',
    'Address Line 3': '',
    'Postal City / Town': 'SOMEWHERE',
    State: 'USA',
    'Postal Zip 5': (Math.floor(Math.random() * 90000) + 10000).toString(),
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
    District: '0',
  };
}

function generateVoters(numVoters: number): Array<Record<string, string>> {
  const voters = [];
  for (let i = 1; i <= numVoters; i += 1) {
    voters.push(generateVoter(i));
  }
  return voters;
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

// Helper function: generate CSV content for street names
function generateStreetCsv(streets: string[]): string {
  // CSV header following the streetNames.csv format.
  const header =
    'Low Range,High Range,Side,Street Name,Postal City,Zip 5,Zip 4,District,School Dist,Village Dist,US Cong,Exec Counc,State Sen,State Rep,State Rep Flot,County Name,County Comm Dist';

  // For each street, randomly decide one of four options:
  // Option 1: one row for ODD
  // Option 2: one row for EVEN
  // Option 3: two rows: one ODD, one EVEN
  // Option 4: one row for ALL
  const rows: string[] = [header];

  for (const street of streets) {
    const option = randomInt(1, 4);
    if (option === 3) {
      // Two rows: ODD and EVEN
      for (const side of ['ODD', 'EVEN'] as Array<'ODD' | 'EVEN'>) {
        const { low, high } = generateRangeForSide(side);
        rows.push(
          `${low},${high},${side},"${street}",SOMEWHERE,12345,,"0",40,N/A,2,5,11,43,37,HILLSBOROUGH,"3RD HILLSBRGH"`
        );
      }
    } else {
      const side: 'ODD' | 'EVEN' | 'ALL' =
        option === 1 ? 'ODD' : option === 2 ? 'EVEN' : 'ALL';
      const { low, high } = generateRangeForSide(side);
      rows.push(
        `${low},${high},${side},"${street}",SOMEWHERE,12345,,"0",40,N/A,2,5,11,43,37,HILLSBOROUGH,"3RD HILLSBRGH"`
      );
    }
  }
  return rows.join('\n');
}

// Updated main to accept an optional outputStreetPath argument
// eslint-disable-next-line vx/gts-jsdoc
export function main(argv: readonly string[], { stdout, stderr }: IO): number {
  if (argv.length < 4 || argv.length > 5) {
    stderr.write(
      'Usage: generate-voters NUM_VOTERS <output-path> [outputStreetPath]\n'
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
  const outputPath = assertDefined(argv[3]);

  const voters = generateVoters(numVotersToGenerate);
  const csvData = stringify(voters, { header: true });

  fs.writeFileSync(outputPath, csvData);

  stdout.write(
    `Generated ${numVotersToGenerate} voters and saved to ${outputPath}\n`
  );

  // If outputStreetPath is provided, generate and write the street names CSV.
  if (argv.length === 5) {
    const outputStreetPath = assertDefined(argv[4]);
    const streetCsv = generateStreetCsv(streetNames);
    fs.writeFileSync(outputStreetPath, streetCsv);
    stdout.write(
      `Generated street names CSV and saved to ${outputStreetPath}\n`
    );
  }

  return 0;
}

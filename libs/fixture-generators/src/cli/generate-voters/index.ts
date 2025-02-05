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
  'Unicorn Ave',
  'Pegasus St',
  'Ocelot Blvd',
  'Lion St',
  'Tiger St',
  'Bear St',
  'Wolf St',
  'Eagle St',
  'Hawk St',
  'Falcon St',
  'Raven St',
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

// eslint-disable-next-line vx/gts-jsdoc
export function main(argv: readonly string[], { stdout, stderr }: IO): number {
  if (argv.length !== 4) {
    stderr.write('Usage: generate-voters NUM_VOTERS <output-path>\n');
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

  return 0;
}

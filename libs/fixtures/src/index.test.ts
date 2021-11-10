import * as fs from 'fs';
import * as fixtures from '.';
import { multiPartiPrimaryElectionCvrData } from './data/electionMultiPartyPrimary/cvrFiles/standard.jsonl';
import { multiPartiPrimaryElectionSemsData } from './data/electionMultiPartyPrimary/semsFiles/standard.csv';
import { simplePrimaryElectionCvrData } from './data/electionPrimary/cvrFiles/standard.txt';
import { electionSample2CvrSmall1 } from './data/electionSample2/cvrFiles/small1.txt';
import { electionSample2CvrSmall2 } from './data/electionSample2/cvrFiles/small2.txt';
import { electionSample2CvrSmall3 } from './data/electionSample2/cvrFiles/small3.txt';
import { electionSample2CvrStandard1 } from './data/electionSample2/cvrFiles/standard.txt';
import { electionSample2CvrStandard2 } from './data/electionSample2/cvrFiles/standard2.txt';
import { msEitherNeitherElectionCvrData } from './data/electionWithMsEitherNeither/cvrFiles/standard.jsonl';
import { msEitherNeitherElectionSemsData } from './data/electionWithMsEitherNeither/semsFiles/standard.csv';
import { electionMinimalExhaustiveCvrData } from './data/electionMinimalExhaustiveSample/cvrFiles/standard.jsonl';
import { electionMinimalExhaustiveSemsData } from './data/electionMinimalExhaustiveSample/semsFiles/standard.csv';

test('has various election definitions', () => {
  expect(
    Object.entries(fixtures)
      .filter(([, value]) => typeof value !== 'function')
      .map(([key]) => key)
  ).toMatchInlineSnapshot(`
    Array [
      "electionSample",
      "electionSample2",
      "primaryElectionSample",
      "multiPartyPrimaryElection",
      "electionSampleLongContent",
      "electionSampleRotation",
      "electionWithMsEitherNeither",
      "electionMinimalExhaustiveSample",
      "electionSampleDefinition",
      "electionSample2Definition",
      "primaryElectionSampleDefinition",
      "multiPartyPrimaryElectionDefinition",
      "electionSampleLongContentDefinition",
      "electionSampleRotationDefinition",
      "electionWithMsEitherNeitherDefinition",
      "electionMinimalExhaustiveSampleDefintion",
      "electionWithMsEitherNeitherRawData",
      "electionMultiPartyPrimaryWithDataFiles",
      "electionSimplePrimaryWithDataFiles",
      "electionSample2WithDataFiles",
      "electionWithMsEitherNeitherWithDataFiles",
      "electionMinimalExhaustiveSampleWithDataFiles",
    ]
  `);
});

const testcases = [
  {
    originalFile:
      './src/data/electionMultiPartyPrimary/semsFiles/standard.original.csv',
    typescriptContent: multiPartiPrimaryElectionSemsData,
  },
  {
    originalFile:
      './src/data/electionMultiPartyPrimary/cvrFiles/standard.original.jsonl',
    typescriptContent: multiPartiPrimaryElectionCvrData,
  },
  {
    originalFile: './src/data/electionPrimary/cvrFiles/standard.original.txt',
    typescriptContent: simplePrimaryElectionCvrData,
  },
  {
    originalFile: './src/data/electionSample2/cvrFiles/small1.original.txt',
    typescriptContent: electionSample2CvrSmall1,
  },
  {
    originalFile: './src/data/electionSample2/cvrFiles/small2.original.txt',
    typescriptContent: electionSample2CvrSmall2,
  },
  {
    originalFile: './src/data/electionSample2/cvrFiles/small3.original.txt',
    typescriptContent: electionSample2CvrSmall3,
  },
  {
    originalFile: './src/data/electionSample2/cvrFiles/standard.original.txt',
    typescriptContent: electionSample2CvrStandard1,
  },
  {
    originalFile: './src/data/electionSample2/cvrFiles/standard2.original.txt',
    typescriptContent: electionSample2CvrStandard2,
  },
  {
    originalFile:
      './src/data/electionWithMsEitherNeither/semsFiles/standard.original.csv',
    typescriptContent: msEitherNeitherElectionSemsData,
  },
  {
    originalFile:
      './src/data/electionWithMsEitherNeither/cvrFiles/standard.original.jsonl',
    typescriptContent: msEitherNeitherElectionCvrData,
  },
  {
    originalFile:
      './src/data/electionMinimalExhaustiveSample/cvrFiles/standard.original.jsonl',
    typescriptContent: electionMinimalExhaustiveCvrData,
  },
  {
    originalFile:
      './src/data/electionMinimalExhaustiveSample/semsFiles/standard.original.csv',
    typescriptContent: electionMinimalExhaustiveSemsData,
  },
];
for (const { originalFile, typescriptContent } of testcases) {
  test(`original data file ${originalFile} contains identical data to typescript export file`, () => {
    const originalFileContent = fs.readFileSync(originalFile, 'utf8');
    // Strip any unnecessary whitespace added to the end of lines before comparison.
    expect(typescriptContent).toBe(originalFileContent.replace(/\s\n/g, '\n'));
  });
}

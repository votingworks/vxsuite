import * as fs from 'fs';
import * as fixtures from '.';
import { multiPartyPrimaryElectionCvrData } from './data/electionMultiPartyPrimary/cvrFiles/standard.jsonl';
import { multiPartyPrimaryElectionSemsData } from './data/electionMultiPartyPrimary/semsFiles/standard.csv';
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
      .sort()
  ).toMatchInlineSnapshot(`
    Array [
      "electionMinimalExhaustiveSample",
      "electionMinimalExhaustiveSampleDefinition",
      "electionMinimalExhaustiveSampleRightSideTargets",
      "electionMinimalExhaustiveSampleRightSideTargetsDefinition",
      "electionMinimalExhaustiveSampleWithDataFiles",
      "electionMultiPartyPrimaryWithDataFiles",
      "electionSample",
      "electionSample2",
      "electionSample2Definition",
      "electionSample2WithDataFiles",
      "electionSampleDefinition",
      "electionSampleLongContent",
      "electionSampleLongContentDefinition",
      "electionSampleRotation",
      "electionSampleRotationDefinition",
      "electionSimplePrimaryWithDataFiles",
      "electionWithMsEitherNeither",
      "electionWithMsEitherNeitherDefinition",
      "electionWithMsEitherNeitherRawData",
      "electionWithMsEitherNeitherWithDataFiles",
      "multiPartyPrimaryElection",
      "multiPartyPrimaryElectionDefinition",
      "primaryElectionSample",
      "primaryElectionSampleDefinition",
    ]
  `);
});

const testcases = [
  {
    originalFile:
      './data/electionMultiPartyPrimary/semsFiles/standard.original.csv',
    typescriptContent: multiPartyPrimaryElectionSemsData,
  },
  {
    originalFile:
      './data/electionMultiPartyPrimary/cvrFiles/standard.original.jsonl',
    typescriptContent: multiPartyPrimaryElectionCvrData,
  },
  {
    originalFile: './data/electionPrimary/cvrFiles/standard.original.txt',
    typescriptContent: simplePrimaryElectionCvrData,
  },
  {
    originalFile: './data/electionSample2/cvrFiles/small1.original.txt',
    typescriptContent: electionSample2CvrSmall1,
  },
  {
    originalFile: './data/electionSample2/cvrFiles/small2.original.txt',
    typescriptContent: electionSample2CvrSmall2,
  },
  {
    originalFile: './data/electionSample2/cvrFiles/small3.original.txt',
    typescriptContent: electionSample2CvrSmall3,
  },
  {
    originalFile: './data/electionSample2/cvrFiles/standard.original.txt',
    typescriptContent: electionSample2CvrStandard1,
  },
  {
    originalFile: './data/electionSample2/cvrFiles/standard2.original.txt',
    typescriptContent: electionSample2CvrStandard2,
  },
  {
    originalFile:
      './data/electionWithMsEitherNeither/semsFiles/standard.original.csv',
    typescriptContent: msEitherNeitherElectionSemsData,
  },
  {
    originalFile:
      './data/electionWithMsEitherNeither/cvrFiles/standard.original.jsonl',
    typescriptContent: msEitherNeitherElectionCvrData,
  },
  {
    originalFile:
      './data/electionMinimalExhaustiveSample/cvrFiles/standard.original.jsonl',
    typescriptContent: electionMinimalExhaustiveCvrData,
  },
  {
    originalFile:
      './data/electionMinimalExhaustiveSample/semsFiles/standard.original.csv',
    typescriptContent: electionMinimalExhaustiveSemsData,
  },
];
for (const { originalFile, typescriptContent } of testcases) {
  test(`original data file ${originalFile} contains identical data to typescript export file`, () => {
    const originalFileContent = fs.readFileSync(originalFile, 'utf8');
    expect(typescriptContent).toEqual(originalFileContent);
  });
}

test('asElectionDefinition', () => {
  expect(
    fixtures.asElectionDefinition(fixtures.electionMinimalExhaustiveSample)
      .election
  ).toEqual(fixtures.electionMinimalExhaustiveSample);
});

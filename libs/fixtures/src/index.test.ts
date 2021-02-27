import * as fixtures from '.'
import * as fs from 'fs'

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
      "electionWithMsEitherNeither",
      "electionSampleDefinition",
      "electionSample2Definition",
      "primaryElectionSampleDefinition",
      "multiPartyPrimaryElectionDefinition",
      "electionSampleLongContentDefinition",
      "electionWithMsEitherNeitherDefinition",
      "electionWithMsEitherNeitherRawData",
      "electionMultiPartyPrimaryWithDataFiles",
      "electionSimplePrimaryWithDataFiles",
      "electionSample2WithDataFiles",
      "electionWithMsEitherNeitherWithDataFiles",
    ]
  `)
})

import multiPartiPrimaryElectionSEMSData from './data/electionMultiPartyPrimary/semsFiles/standard.csv'
import multiPartiPrimaryElectionCVRData from './data/electionMultiPartyPrimary/cvrFiles/standard.jsonl'
import simplePrimaryElectionCVRData from './data/electionPrimary/cvrFiles/standard.txt'
import electionSample2CVRSmall1 from './data/electionSample2/cvrFiles/small1.txt'
import electionSample2CVRSmall2 from './data/electionSample2/cvrFiles/small2.txt'
import electionSample2CVRSmall3 from './data/electionSample2/cvrFiles/small3.txt'
import electionSample2CVRStandard1 from './data/electionSample2/cvrFiles/standard.txt'
import electionSample2CVRStandard2 from './data/electionSample2/cvrFiles/standard2.txt'
import msEitherNeitherElectionSEMSData from './data/electionWithMsEitherNeither/semsFiles/standard.csv'
import msEitherNeitherElectionCVRData from './data/electionWithMsEitherNeither/cvrFiles/standard.jsonl'

const testcases = [
  {
    originalFile:
      './src/data/electionMultiPartyPrimary/semsFiles/standard.original.csv',
    typescriptContent: multiPartiPrimaryElectionSEMSData,
  },
  {
    originalFile:
      './src/data/electionMultiPartyPrimary/cvrFiles/standard.original.jsonl',
    typescriptContent: multiPartiPrimaryElectionCVRData,
  },
  {
    originalFile: './src/data/electionPrimary/cvrFiles/standard.original.txt',
    typescriptContent: simplePrimaryElectionCVRData,
  },
  {
    originalFile: './src/data/electionSample2/cvrFiles/small1.original.txt',
    typescriptContent: electionSample2CVRSmall1,
  },
  {
    originalFile: './src/data/electionSample2/cvrFiles/small2.original.txt',
    typescriptContent: electionSample2CVRSmall2,
  },
  {
    originalFile: './src/data/electionSample2/cvrFiles/small3.original.txt',
    typescriptContent: electionSample2CVRSmall3,
  },
  {
    originalFile: './src/data/electionSample2/cvrFiles/standard.original.txt',
    typescriptContent: electionSample2CVRStandard1,
  },
  {
    originalFile: './src/data/electionSample2/cvrFiles/standard2.original.txt',
    typescriptContent: electionSample2CVRStandard2,
  },
  {
    originalFile:
      './src/data/electionWithMsEitherNeither/semsFiles/standard.original.csv',
    typescriptContent: msEitherNeitherElectionSEMSData,
  },
  {
    originalFile:
      './src/data/electionWithMsEitherNeither/cvrFiles/standard.original.jsonl',
    typescriptContent: msEitherNeitherElectionCVRData,
  },
]
for (const { originalFile, typescriptContent } of testcases) {
  test(`original data file ${originalFile} contains identical data to typescript export file`, () => {
    const originalFileContent = fs.readFileSync(originalFile, 'utf8')
    // Strip any unnecessary whitespace added to the end of lines before comparison.
    expect(typescriptContent).toBe(originalFileContent.replace(/\s\n/g, '\n'))
  })
}

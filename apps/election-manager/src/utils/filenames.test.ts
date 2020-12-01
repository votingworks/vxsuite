import { generateFilenameForBallotExportPackage } from './filenames'
import { defaultElectionDefinition } from '../../test/renderInAppContext'

test('generates ballot export package names as expected with simple inputs', () => {
  const mockElection = {
    election: {
      ...defaultElectionDefinition.election,
      county: { name: 'King County', id: '' },
      title: 'General Election',
    },
    electionHash: 'testHash12',
    electionData: '',
  }
  const time = new Date(2019, 2, 14, 15, 9, 26)
  expect(generateFilenameForBallotExportPackage(mockElection, time)).toBe(
    'king-county_general-election_testHash12__2019-03-14_15-09-26.zip'
  )
})

test('generates ballot export package names as expected when election information has weird characters', () => {
  const mockElection = {
    election: {
      ...defaultElectionDefinition.election,
      county: { name: 'King County!!', id: '' },
      title: '-_General__Election$$',
    },
    electionHash: 'testHash12',
    electionData: '',
  }
  const time = new Date(2019, 2, 14, 15, 9, 26)
  expect(generateFilenameForBallotExportPackage(mockElection, time)).toBe(
    'king-county_general-election_testHash12__2019-03-14_15-09-26.zip'
  )
})

test('generates ballot export package name with truncated election hash', () => {
  const mockElection = {
    election: {
      ...defaultElectionDefinition.election,
      county: { name: 'King County', id: '' },
      title: 'General Election',
    },
    electionHash: 'testHash123456789',
    electionData: '',
  }
  const time = new Date(2019, 2, 14, 15, 9, 26)
  expect(generateFilenameForBallotExportPackage(mockElection, time)).toBe(
    'king-county_general-election_testHash12__2019-03-14_15-09-26.zip'
  )
})

test('generates ballot export package name with zero padded time pieces', () => {
  const mockElection = {
    election: {
      ...defaultElectionDefinition.election,
      county: { name: 'King County', id: '' },
      title: 'General Election',
    },
    electionHash: 'testHash12',
    electionData: '',
  }
  const time = new Date(2019, 2, 1, 1, 9, 2)
  expect(generateFilenameForBallotExportPackage(mockElection, time)).toBe(
    'king-county_general-election_testHash12__2019-03-01_01-09-02.zip'
  )
})

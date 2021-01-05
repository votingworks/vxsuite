import {
  generateFilenameForBallotExportPackage,
  parseCVRFileInfoFromFilename,
} from './filenames'
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

describe('parseCVRFileInfoFromFilename', () => {
  test('parses a basic name not in test mode properly', () => {
    const name = 'machine_5__1_ballots__2020-12-08_10-42-02.jsonl'
    const results = parseCVRFileInfoFromFilename(name)
    expect(results).toEqual({
      isTestModeResults: false,
      machineId: '5',
      numberOfBallots: 1,
      timestamp: new Date(2020, 11, 8, 10, 42, 2),
    })
  })

  test('parses a basic name in test mode properly', () => {
    const name = 'TEST__machine_0002__54_ballots__2020-12-08_10-42-02.jsonl'
    const results = parseCVRFileInfoFromFilename(name)
    expect(results).toEqual({
      isTestModeResults: true,
      machineId: '0002',
      numberOfBallots: 54,
      timestamp: new Date(2020, 11, 8, 10, 42, 2),
    })
  })

  test('returns illegal date when the timestamp cant be parsed', () => {
    const results = parseCVRFileInfoFromFilename(
      'TEST__machine_0002__54_ballots__notatimestamp.jsonl'
    )
    expect(results!.toString()).toEqual(
      {
        isTestModeResults: true,
        machineId: '0002',
        numberOfBallots: 54,
        timestamp: new Date(NaN),
      }.toString()
    )
  })

  test('parses as much of the date as possible', () => {
    const results = parseCVRFileInfoFromFilename(
      'TEST__machine_0002__54_ballots__2020-12-08.jsonl'
    )
    expect(results).toEqual({
      isTestModeResults: true,
      machineId: '0002',
      numberOfBallots: 54,
      timestamp: new Date(2020, 11, 8),
    })
  })

  test('fails when the format of the filename is unexpected', () => {
    expect(
      parseCVRFileInfoFromFilename(
        'INVALID__machine_0002__54_ballots__2020-12-08_10-42-02.jsonl'
      )
    ).toBeUndefined()
    expect(
      parseCVRFileInfoFromFilename(
        '__machine_0002__54_ballots__2020-12-08_10-42-02.jsonl'
      )
    ).toBeUndefined()
    expect(
      parseCVRFileInfoFromFilename(
        'machine_0002__54_ballots__2020-12-08__10-42-02.jsonl'
      )
    ).toBeUndefined()

    expect(
      parseCVRFileInfoFromFilename(
        'TEST__something__machine_0002__54_ballots__2020-12-08_10-42-02.jsonl'
      )
    ).toBeUndefined()
    expect(
      parseCVRFileInfoFromFilename(
        'TEST__unicorn_0002__54_ballots__2020-12-08_10-42-02.jsonl'
      )
    ).toBeUndefined()
    expect(
      parseCVRFileInfoFromFilename(
        'TEST__machine_0002__54_puppies__2020-12-08_10-42-02.jsonl'
      )
    ).toBeUndefined()
    expect(
      parseCVRFileInfoFromFilename(
        'TEST__machine_0002__54__2020-12-08_10-42-02.jsonl'
      )
    ).toBeUndefined()
    expect(
      parseCVRFileInfoFromFilename(
        'TEST__0002__54_ballots__2020-12-08_10-42-02.jsonl'
      )
    ).toBeUndefined()
  })
})

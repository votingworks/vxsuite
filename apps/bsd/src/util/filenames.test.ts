import { electionSample } from '@votingworks/ballot-encoder'
import {
  parseBallotExportPackageInfoFromFilename,
  generateElectionBasedSubfolderName,
  generateFilenameForScanningResults,
} from './filenames'

describe('parseBallotExportPackageInfoFromFilename', () => {
  test('parses a basic name properly', () => {
    const name =
      'choctaw-county_2020-general-election_a5753d5776__2020-12-02_09-42-50.zip'

    const parsedInfo = parseBallotExportPackageInfoFromFilename(name)
    expect(parsedInfo).toBeTruthy()
    const {
      electionCounty,
      electionName,
      electionHash,
      timestamp,
    } = parsedInfo!
    expect(electionCounty).toBe('choctaw county')
    expect(electionName).toBe('2020 general election')
    expect(electionHash).toBe('a5753d5776')
    expect(timestamp).toStrictEqual(new Date(2020, 11, 2, 9, 42, 50))
  })

  test('fails to parse a name with the section seperator twice', () => {
    const name =
      'choctaw-county_2020-general-election__a5753d5776__2020-12-02_09-42-50.zip'

    expect(parseBallotExportPackageInfoFromFilename(name)).toBeUndefined()
  })

  test('fails to parse a name with a bad election string', () => {
    const name =
      'choctaw-county_2020-general_election_a5753d5776__2020-12-02_09-42-50.zip'

    expect(parseBallotExportPackageInfoFromFilename(name)).toBeUndefined()
  })
})

describe('generateElectionBasedSubfolderName', () => {
  test('generates basic election subfolder name as expected', () => {
    const mockElection = {
      ...electionSample,
      county: { name: 'King County', id: '' },
      title: 'General Election',
    }
    expect(generateElectionBasedSubfolderName(mockElection, 'testHash12')).toBe(
      'king-county_general-election_testHash12'
    )
  })

  test('generates election subfolder name as expected when election county and title have weird characters', () => {
    const mockElection = {
      ...electionSample,
      county: { name: '-K(ing&COUN-----TY**', id: '' },
      title: 'General-Election@@',
    }
    expect(generateElectionBasedSubfolderName(mockElection, 'testHash12')).toBe(
      'k-ing-coun-ty_general-election_testHash12'
    )
  })

  test('generates election subfolder name as expected when election hash length varies', () => {
    const mockElection = {
      ...electionSample,
      county: { name: 'King County', id: '' },
      title: 'General Election',
    }
    expect(
      generateElectionBasedSubfolderName(
        mockElection,
        'testHash12thisisextratext'
      )
    ).toBe('king-county_general-election_testHash12')

    expect(generateElectionBasedSubfolderName(mockElection, '')).toBe(
      'king-county_general-election_'
    )

    expect(generateElectionBasedSubfolderName(mockElection, 'short')).toBe(
      'king-county_general-election_short'
    )
  })
})

describe('generateFilenameForScanningResults', () => {
  test('generates basic scanning results filename in test mode', () => {
    const time = new Date(2019, 2, 14, 15, 9, 26)
    expect(generateFilenameForScanningResults('1', 0, true, time)).toBe(
      'TEST__machine_1__0_ballots__2019-03-14_15-09-26.jsonl'
    )

    expect(
      generateFilenameForScanningResults('po!n@y:__', 35, true, time)
    ).toBe('TEST__machine_pony__35_ballots__2019-03-14_15-09-26.jsonl')
  })

  test('generates basic scanning results filename not in test mode', () => {
    const time = new Date(2019, 2, 14, 15, 9, 26)
    expect(generateFilenameForScanningResults('1', 0, false, time)).toBe(
      'machine_1__0_ballots__2019-03-14_15-09-26.jsonl'
    )
    expect(
      generateFilenameForScanningResults('<3-u!n#icorn<3', 1, false, time)
    ).toBe('machine_3unicorn3__1_ballots__2019-03-14_15-09-26.jsonl')
  })
})

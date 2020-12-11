import { parseBallotExportPackageInfoFromFilename } from './filenames'

test('parses a basic name properly', () => {
  const name =
    'choctaw-county_2020-general-election_a5753d5776__2020-12-02_09-42-50.zip'

  const parsedInfo = parseBallotExportPackageInfoFromFilename(name)
  expect(parsedInfo).toBeTruthy()
  const { electionCounty, electionName, electionHash, timestamp } = parsedInfo!
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

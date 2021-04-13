import { electionSample } from '@votingworks/fixtures'
import { generateDefaultReportFilename } from './saveAsPDF'

test('file path name is generated properly', async () => {
  const testCases = [
    {
      // The file path should always be lowercased
      prefix: 'TeSt',
      precinctName: 'nAmE',
      expected: 'test-franklin-county-general-election-name.pdf',
    },
    {
      // The file path should always be lowercased
      prefix: 'TEST',
      precinctName: 'NAME',
      expected: 'test-franklin-county-general-election-name.pdf',
    },
    {
      // Dashes at the start or end of the path name should be removed
      prefix: '-TEST',
      precinctName: 'NAME---',
      expected: 'test-franklin-county-general-election-name.pdf',
    },
    {
      // Dashes at the start or end of the path name should be removed
      prefix: '',
      precinctName: '',
      expected: 'franklin-county-general-election.pdf',
    },
    {
      // Unknown characters should be replaced by dashes
      prefix: 'te.st',
      precinctName: 'precinct name',
      expected: 'te-st-franklin-county-general-election-precinct-name.pdf',
    },
    {
      // Multiple errors should be corrected together
      prefix: 'Test.Report FINAL',
      precinctName: 'precinct name---',
      expected:
        'test-report-final-franklin-county-general-election-precinct-name.pdf',
    },
  ]
  for (const { prefix, precinctName, expected } of testCases) {
    expect(
      generateDefaultReportFilename(prefix, electionSample, precinctName)
    ).toBe(expected)
  }
})

test('precinct name fills in all-precincts as default value', async () => {
  expect(generateDefaultReportFilename('test', electionSample)).toBe(
    'test-franklin-county-general-election-all-precincts.pdf'
  )
})

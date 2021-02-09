import { electionSample } from '@votingworks/fixtures'
import saveAsPDF from './saveAsPDF'
import fakeKiosk from '../../test/helpers/fakeKiosk'
import fakeFileWriter from '../../test/helpers/fakeFileWriter'

test('saves pdf with expected filename for a precinct', async () => {
  const mockKiosk = fakeKiosk()
  window.kiosk = mockKiosk
  const fileWriter = fakeFileWriter()

  mockKiosk.saveAs.mockResolvedValueOnce(fileWriter)

  const succeeded = await saveAsPDF('test', electionSample, 'name')
  expect(mockKiosk.saveAs).toHaveBeenCalledTimes(1)
  expect(mockKiosk.saveAs).toHaveBeenCalledWith({
    defaultPath: 'test-franklin-county-general-election-name.pdf',
  })
  expect(succeeded).toBe(true)
})

test('file path name is manipulated properly', async () => {
  const mockKiosk = fakeKiosk()
  window.kiosk = mockKiosk
  const fileWriter = fakeFileWriter()

  mockKiosk.saveAs.mockResolvedValue(fileWriter)

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
    const succeeded = await saveAsPDF(prefix, electionSample, precinctName)
    expect(mockKiosk.saveAs).toHaveBeenCalledWith({ defaultPath: expected })
    expect(succeeded).toBe(true)
  }
})

test('precinct name fills in all-precincts as default value', async () => {
  const mockKiosk = fakeKiosk()
  window.kiosk = mockKiosk
  const fileWriter = fakeFileWriter()

  mockKiosk.saveAs.mockResolvedValueOnce(fileWriter)

  const succeeded = await saveAsPDF('test', electionSample)
  expect(mockKiosk.saveAs).toHaveBeenCalledTimes(1)
  expect(mockKiosk.saveAs).toHaveBeenCalledWith({
    defaultPath: 'test-franklin-county-general-election-all-precincts.pdf',
  })
  expect(succeeded).toBe(true)
})

test('saveAsPDF returns false when a filewriter is not returned by saveAs', async () => {
  const mockKiosk = fakeKiosk()
  window.kiosk = mockKiosk

  mockKiosk.saveAs.mockResolvedValueOnce(undefined)

  const succeeded = await saveAsPDF('test', electionSample)
  expect(mockKiosk.saveAs).toHaveBeenCalledTimes(1)
  expect(succeeded).toBe(false)
})

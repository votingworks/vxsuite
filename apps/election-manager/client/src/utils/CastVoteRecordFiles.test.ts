import { electionSample } from '@votingworks/ballot-encoder'
import CastVoteRecordFiles from './CastVoteRecordFiles'
import { CastVoteRecord } from '../config/types'

test('starts out empty', () => {
  const files = CastVoteRecordFiles.empty
  expect(files.castVoteRecords).toEqual([])
  expect(files.duplicateFiles).toEqual([])
  expect(files.fileList).toEqual([])
  expect(files.lastError).toBeUndefined()
})

test('can add a CVR file by creating a new instance', async () => {
  const { empty } = CastVoteRecordFiles
  const added = await empty.add(new File([''], 'cvrs.txt'), electionSample)

  expect(added.castVoteRecords).toEqual([[]])
  expect(added.duplicateFiles).toEqual([])
  expect(added.fileList).toEqual([
    { name: 'cvrs.txt', count: 0, precinctIds: [] },
  ])
  expect(added.lastError).toBeUndefined()
})

test('can add multiple CVR files by creating a new instance', async () => {
  const { empty } = CastVoteRecordFiles
  const cvr: CastVoteRecord = {
    _ballotId: 'abc',
    _ballotStyleId: '12',
    _precinctId: '23',
    _testBallot: false,
    _scannerId: 'abc',
  }
  const added = await empty.addAll(
    [new File([''], 'cvrs.txt'), new File([JSON.stringify(cvr)], 'cvrs2.txt')],
    electionSample
  )

  expect(added.castVoteRecords).toEqual([[], [cvr]])
  expect(added.duplicateFiles).toEqual([])
  expect(added.fileList).toEqual([
    { name: 'cvrs.txt', count: 0, precinctIds: [] },
    { name: 'cvrs2.txt', count: 1, precinctIds: ['23'] },
  ])
  expect(added.lastError).toBeUndefined()
})

test('does not mutate the original when adding a new instance', async () => {
  const { empty } = CastVoteRecordFiles
  const cvr: CastVoteRecord = {
    _ballotId: 'abc',
    _ballotStyleId: '12',
    _precinctId: '23',
    _testBallot: false,
    _scannerId: 'abc',
  }
  const added = await empty.add(
    new File([JSON.stringify(cvr)], 'cvrs.txt'),
    electionSample
  )

  expect(empty.castVoteRecords).toEqual([])
  expect(empty.duplicateFiles).toEqual([])
  expect(empty.fileList).toEqual([])
  expect(empty.lastError).toBeUndefined()

  expect(added.castVoteRecords).toEqual([[cvr]])
  expect(added.duplicateFiles).toEqual([])
  expect(added.fileList).toEqual([
    { name: 'cvrs.txt', count: 1, precinctIds: ['23'] },
  ])
  expect(added.lastError).toBeUndefined()
})

test('records JSON errors', async () => {
  const added = await CastVoteRecordFiles.empty.add(
    new File(['{bad json'], 'cvrs.txt'),
    electionSample
  )

  expect(added.castVoteRecords).toEqual([])
  expect(added.duplicateFiles).toEqual([])
  expect(added.fileList).toEqual([])
  expect(added.lastError).toEqual({
    filename: 'cvrs.txt',
    message: 'Unexpected token b in JSON at position 1',
  })
})

test('records CVR data errors', async () => {
  const cvr: CastVoteRecord = {
    _ballotId: 'abc',
    _ballotStyleId: '12',
    _precinctId: '9999',
    _testBallot: false,
    _scannerId: 'abc',
  }
  const added = await CastVoteRecordFiles.empty.add(
    new File([JSON.stringify(cvr)], 'cvrs.txt'),
    electionSample
  )

  expect(added.castVoteRecords).toEqual([])
  expect(added.duplicateFiles).toEqual([])
  expect(added.fileList).toEqual([])
  expect(added.lastError).toEqual({
    filename: 'cvrs.txt',
    message: "Line 1: Precinct '9999' in CVR is not in the election definition",
  })
})

test('records identical uploaded files', async () => {
  const cvr: CastVoteRecord = {
    _ballotId: 'abc',
    _ballotStyleId: '12',
    _precinctId: '23',
    _testBallot: false,
    _scannerId: 'abc',
  }
  const added = await CastVoteRecordFiles.empty.addAll(
    [
      new File([JSON.stringify(cvr)], 'cvrs.txt'),
      new File([JSON.stringify(cvr)], 'cvrs2.txt'),
    ],
    electionSample
  )

  expect(added.castVoteRecords).toEqual([[cvr]])
  expect(added.duplicateFiles).toEqual(['cvrs2.txt'])
  expect(added.fileList).toEqual([
    { name: 'cvrs.txt', count: 1, precinctIds: ['23'] },
  ])
  expect(added.lastError).toBeUndefined()
})

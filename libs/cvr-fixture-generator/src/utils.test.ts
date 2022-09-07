import { castVoteRecordHasWriteIns, generateCombinations } from './utils';

test('generateCombinations', () => {
  expect(generateCombinations([1, 2, 3], 0)).toStrictEqual([]);
  expect(generateCombinations([1, 2, 3], 1)).toStrictEqual([[1], [2], [3]]);
  expect(generateCombinations([1, 2, 3], 2)).toStrictEqual([
    [1, 2],
    [1, 3],
    [2, 3],
  ]);
  expect(generateCombinations([1, 2, 3], 3)).toStrictEqual([[1, 2, 3]]);
  expect(generateCombinations([1, 2, 3], 4)).toStrictEqual([]);
});

test('castVoteRecordHasWriteIns with no votes', () => {
  expect(
    castVoteRecordHasWriteIns({
      _ballotStyleId: '1',
      _ballotType: 'standard',
      _precinctId: '1',
      _scannerId: '1',
      _testBallot: false,
      _batchId: '1',
      _batchLabel: '1',
    })
  ).toEqual(false);
});

test('castVoteRecordHasWriteIns with non-write-in votes', () => {
  expect(
    castVoteRecordHasWriteIns({
      _ballotStyleId: '1',
      _ballotType: 'standard',
      _precinctId: '1',
      _scannerId: '1',
      _testBallot: false,
      _batchId: '1',
      _batchLabel: '1',
      mayor: ['mickey'],
    })
  ).toEqual(false);
});

test('castVoteRecordHasWriteIns with write-in votes', () => {
  expect(
    castVoteRecordHasWriteIns({
      _ballotStyleId: '1',
      _ballotType: 'standard',
      _precinctId: '1',
      _scannerId: '1',
      _testBallot: false,
      _batchId: '1',
      _batchLabel: '1',
      mayor: ['mickey'],
      council: ['donald', 'write-in-0'],
    })
  ).toEqual(true);
});

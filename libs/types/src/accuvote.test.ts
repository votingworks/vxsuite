import {
  BallotPageTimingMarkMetadataBack,
  BallotPageTimingMarkMetadataFront,
  IndexedCapitalLetterSchema,
  areBallotPageTimingMarkMetadataBackEqual,
  areBallotPageTimingMarkMetadataFrontEqual,
} from './accuvote';

test('IndexedCapitalLetterSchema', () => {
  expect(IndexedCapitalLetterSchema.parse('A')).toEqual('A');
  expect(() => IndexedCapitalLetterSchema.parse('AA')).toThrow();
});

test('areBallotPageTimingMarkMetadataFrontEqual', () => {
  const a: BallotPageTimingMarkMetadataFront = {
    side: 'front',
    mod4Checksum: 0,
    computedMod4Checksum: 0,
    batchOrPrecinctNumber: 0,
    cardNumber: 0,
    sequenceNumber: 0,
    startBit: 0,
  };
  const b: BallotPageTimingMarkMetadataFront = {
    ...a,
  };
  expect(areBallotPageTimingMarkMetadataFrontEqual(a, b)).toEqual(true);
  b.startBit = 1;
  expect(areBallotPageTimingMarkMetadataFrontEqual(a, b)).toEqual(false);
});

test('areBallotPageTimingMarkMetadataBackEqual', () => {
  const a: BallotPageTimingMarkMetadataBack = {
    side: 'back',
    electionType: 'G',
    electionYear: 2020,
    electionMonth: 11,
    electionDay: 3,
  };
  const b: BallotPageTimingMarkMetadataBack = {
    ...a,
  };
  expect(areBallotPageTimingMarkMetadataBackEqual(a, b)).toEqual(true);
  b.electionDay = 1;
  expect(areBallotPageTimingMarkMetadataBackEqual(a, b)).toEqual(false);
});

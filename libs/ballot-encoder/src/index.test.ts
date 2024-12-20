import { expect, test } from 'vitest';
import { readElectionGeneralDefinition as readElectionDefinition } from '@votingworks/fixtures';
import {
  BallotIdSchema,
  BallotStyleId,
  BallotType,
  BallotTypeMaximumValue,
  CompletedBallot,
  getContests,
  HmpbBallotPageMetadata,
  isVotePresent,
  unsafeParse,
  vote,
  VotesDict,
} from '@votingworks/types';
import { BitReader, BitWriter } from './bits';
import {
  decodeBallot,
  decodeBallotHash,
  isVxBallot,
  BALLOT_HASH_ENCODING_LENGTH,
  encodeBallot,
  encodeBallotInto,
  HexEncoding,
  MAXIMUM_WRITE_IN_LENGTH,
  BmdPrelude,
  WriteInEncoding,
  sliceBallotHashForEncoding,
  encodeBallotConfigInto,
  encodeHmpbBallotPageMetadata,
  decodeBallotHashFromReader,
  decodeBallotConfigFromReader,
  MAXIMUM_PRECINCTS,
  MAXIMUM_BALLOT_STYLES,
} from '.';

const precinctBallotTypeIndex = Object.values(BallotType).indexOf(
  BallotType.Precinct
);

function falses(count: number): boolean[] {
  return Array.from({ length: count }, () => false);
}

test('sliceBallotHashForEncoding', () => {
  expect(sliceBallotHashForEncoding('0000000000000000000000000')).toEqual(
    '00000000000000000000'
  );
});

test('can detect an encoded ballot', () => {
  expect(isVxBallot(Uint8Array.of(...BmdPrelude))).toEqual(true);
  expect(isVxBallot(Uint8Array.of())).toEqual(false);
  expect(isVxBallot(Uint8Array.of(0, ...BmdPrelude))).toEqual(false);
  expect(isVxBallot(Uint8Array.of(...BmdPrelude.slice(0, -2)))).toEqual(false);
});

test('encodes & decodes with Uint8Array as the standard encoding interface', () => {
  const { election, ballotHash } = readElectionDefinition();
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const contests = getContests({ election, ballotStyle });
  const votes = vote(contests, {});
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const ballot: CompletedBallot = {
    ballotHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: false,
    ballotType: BallotType.Precinct,
  };

  expect(decodeBallot(election, encodeBallot(election, ballot))).toEqual({
    ...ballot,
    ballotHash: ballotHash.slice(0, BALLOT_HASH_ENCODING_LENGTH),
  });
});

test('encodes & decodes empty votes correctly', () => {
  const { election, ballotHash } = readElectionDefinition();
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const contests = getContests({ ballotStyle, election });
  const votes = vote(contests, {});
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const ballot: CompletedBallot = {
    ballotHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: false,
    ballotType: BallotType.Precinct,
  };
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false, length: 2 })
    .writeUint8(2)
    // ballot hash
    .writeString(ballotHash.slice(0, BALLOT_HASH_ENCODING_LENGTH), {
      encoding: HexEncoding,
      includeLength: false,
      length: BALLOT_HASH_ENCODING_LENGTH,
    })
    // precinct index
    .writeUint(0, { max: MAXIMUM_PRECINCTS })
    // ballot style index
    .writeUint(0, { max: MAXIMUM_BALLOT_STYLES })
    // test ballot?
    .writeBoolean(false)
    // ballot type
    .writeUint(precinctBallotTypeIndex, { max: BallotTypeMaximumValue })
    // ballot id?
    .writeBoolean(true)
    // ballot id
    .writeString('abcde')
    // vote roll call only, no vote data
    .writeBoolean(...contests.map(() => false))
    .toUint8Array();

  expect(encodeBallot(election, ballot)).toEqualBits(encodedBallot);
  expect(decodeBallot(election, encodedBallot)).toEqual({
    ...ballot,
    ballotHash: ballotHash.slice(0, BALLOT_HASH_ENCODING_LENGTH),
  });
});

test('encodes & decodes without a ballot id', () => {
  const { election, ballotHash } = readElectionDefinition();
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const contests = getContests({ ballotStyle, election });
  const votes = vote(contests, {});
  const ballot: CompletedBallot = {
    ballotHash,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: false,
    ballotType: BallotType.Precinct,
  };
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false, length: 2 })
    .writeUint8(2)
    // ballot hash
    .writeString(ballotHash.slice(0, BALLOT_HASH_ENCODING_LENGTH), {
      encoding: HexEncoding,
      includeLength: false,
      length: BALLOT_HASH_ENCODING_LENGTH,
    })
    // precinct index
    .writeUint(0, { max: MAXIMUM_PRECINCTS })
    // ballot style index
    .writeUint(0, { max: MAXIMUM_BALLOT_STYLES })
    // test ballot?
    .writeBoolean(false)
    // ballot type
    .writeUint(precinctBallotTypeIndex, { max: BallotTypeMaximumValue })
    // ballot id?
    .writeBoolean(false)
    // vote roll call only, no vote data
    .writeBoolean(...contests.map(() => false))
    .toUint8Array();

  expect(encodeBallot(election, ballot)).toEqualBits(encodedBallot);
  expect(decodeBallot(election, encodedBallot)).toEqual({
    ...ballot,
    ballotHash: ballotHash.slice(0, BALLOT_HASH_ENCODING_LENGTH),
  });
});

test('encodes & decodes whether it is a test ballot', () => {
  const { election, ballotHash } = readElectionDefinition();
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const contests = getContests({ ballotStyle, election });
  const votes = vote(contests, {});
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const ballot: CompletedBallot = {
    ballotHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: true,
    ballotType: BallotType.Precinct,
  };
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false, length: 2 })
    .writeUint8(2)
    // ballot hash
    .writeString(ballotHash.slice(0, BALLOT_HASH_ENCODING_LENGTH), {
      encoding: HexEncoding,
      includeLength: false,
      length: BALLOT_HASH_ENCODING_LENGTH,
    })
    // precinct index
    .writeUint(0, { max: MAXIMUM_PRECINCTS })
    // ballot style index
    .writeUint(0, { max: MAXIMUM_BALLOT_STYLES })
    // test ballot?
    .writeBoolean(true)
    // ballot type
    .writeUint(precinctBallotTypeIndex, { max: BallotTypeMaximumValue })
    // ballot id?
    .writeBoolean(true)
    // ballot id
    .writeString('abcde')
    // vote roll call only, no vote data
    .writeBoolean(...contests.map(() => false))
    .toUint8Array();

  expect(encodeBallot(election, ballot)).toEqualBits(encodedBallot);
  expect(decodeBallot(election, encodedBallot)).toEqual({
    ...ballot,
    ballotHash: ballotHash.slice(0, BALLOT_HASH_ENCODING_LENGTH),
  });
});

test('encodes & decodes the ballot type', () => {
  const { election, ballotHash } = readElectionDefinition();
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const contests = getContests({ ballotStyle, election });
  const votes = vote(contests, {});
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const absenteeBallotTypeIndex = Object.values(BallotType).indexOf(
    BallotType.Absentee
  );
  const ballot: CompletedBallot = {
    ballotHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: true,
    ballotType: BallotType.Absentee,
  };
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false, length: 2 })
    .writeUint8(2)
    // ballot hash
    .writeString(ballotHash.slice(0, BALLOT_HASH_ENCODING_LENGTH), {
      encoding: HexEncoding,
      includeLength: false,
      length: BALLOT_HASH_ENCODING_LENGTH,
    })
    // precinct index
    .writeUint(0, { max: MAXIMUM_PRECINCTS })
    // ballot style index
    .writeUint(0, { max: MAXIMUM_BALLOT_STYLES })
    // test ballot?
    .writeBoolean(true)
    // ballot type
    .writeUint(absenteeBallotTypeIndex, { max: BallotTypeMaximumValue })
    // ballot id?
    .writeBoolean(true)
    // ballot id
    .writeString('abcde')
    // vote roll call only, no vote data
    .writeBoolean(...contests.map(() => false))
    .toUint8Array();

  expect(encodeBallot(election, ballot)).toEqualBits(encodedBallot);
  expect(decodeBallot(election, encodedBallot)).toEqual({
    ...ballot,
    ballotHash: ballotHash.slice(0, BALLOT_HASH_ENCODING_LENGTH),
  });
});

test('encodes & decodes yesno votes correctly', () => {
  const { election, ballotHash } = readElectionDefinition();
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const contests = getContests({ ballotStyle, election });
  const votes = vote(contests, {
    'judicial-robert-demergue': ['judicial-robert-demergue-option-yes'],
    'judicial-elmer-hull': ['judicial-elmer-hull-option-yes'],
    'question-a': ['question-a-option-yes'],
    'question-b': ['question-b-option-no'],
    'question-c': ['question-c-option-yes'],
    'proposition-1': [],
    'measure-101': ['measure-101-option-no'],
    '102': ['measure-102-option-yes'],
  });
  const ballot: CompletedBallot = {
    ballotHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: false,
    ballotType: BallotType.Precinct,
  };
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false, length: 2 })
    .writeUint8(2)
    // ballot hash
    .writeString(ballotHash.slice(0, BALLOT_HASH_ENCODING_LENGTH), {
      encoding: HexEncoding,
      includeLength: false,
      length: BALLOT_HASH_ENCODING_LENGTH,
    })
    // precinct index
    .writeUint(0, { max: MAXIMUM_PRECINCTS })
    // ballot style index
    .writeUint(0, { max: MAXIMUM_BALLOT_STYLES })
    // test ballot?
    .writeBoolean(false)
    // ballot type
    .writeUint(precinctBallotTypeIndex, { max: BallotTypeMaximumValue })
    // ballot id?
    .writeBoolean(true)
    // ballot id
    .writeString('abcde')
    // vote roll call
    .writeBoolean(
      ...contests.map((contest) => isVotePresent(votes[contest.id]))
    )
    // vote data
    .writeBoolean(true)
    .writeBoolean(true)
    .writeBoolean(true)
    .writeBoolean(false)
    .writeBoolean(true)
    .writeBoolean(false)
    .writeBoolean(true)
    .toUint8Array();

  expect(encodeBallot(election, ballot)).toEqualBits(encodedBallot);
  expect(encodeBallot(election, decodeBallot(election, encodedBallot))).toEqual(
    encodedBallot
  );
});

test('throws on invalid precinct', () => {
  const { election, ballotHash } = readElectionDefinition();
  const ballotStyle = election.ballotStyles[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = 'not-a-precinct';
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const contests = getContests({ ballotStyle, election });
  const votes = vote(contests, {});
  const ballot: CompletedBallot = {
    ballotHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: false,
    ballotType: BallotType.Precinct,
  };

  expect(() => encodeBallot(election, ballot)).toThrowError(
    'precinct ID not found: not-a-precinct'
  );
});

test('throws on invalid ballot style', () => {
  const { election } = readElectionDefinition();
  const precinct = election.precincts[0]!;
  const ballotStyleId = 'not-a-ballot-style' as BallotStyleId;
  const precinctId = precinct.id;
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');

  expect(() =>
    encodeBallotConfigInto(
      election,
      {
        ballotStyleId,
        precinctId,
        ballotId,
        ballotType: BallotType.Precinct,
        isTestMode: false,
      },
      new BitWriter()
    )
  ).toThrowError('ballot style ID not found: not-a-ballot-style');
});

test('throws on trying to encode a bad yes/no vote', () => {
  const { election, ballotHash } = readElectionDefinition();
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const contests = getContests({ ballotStyle, election });
  const votes = vote(contests, {});
  votes['judicial-robert-demergue'] =
    'judicial-robert-demergue-option-yes' as unknown as string[];
  const ballot: CompletedBallot = {
    ballotHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: false,
    ballotType: BallotType.Precinct,
  };

  expect(() => encodeBallot(election, ballot)).toThrowError(
    'cannot encode a non-array yes/no vote: "judicial-robert-demergue-option-yes"'
  );

  // overvotes fail too.
  ballot.votes['judicial-robert-demergue'] = [
    'judicial-robert-demergue-option-yes',
    'judicial-robert-demergue-option-no',
  ];
  expect(() => encodeBallot(election, ballot)).toThrowError(
    'cannot encode a yes/no overvote: ["judicial-robert-demergue-option-yes","judicial-robert-demergue-option-no"]'
  );
});

test('throws on trying to encode a ballot style', () => {
  const { election, ballotHash } = readElectionDefinition();
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = `${ballotStyle.id}-CORRUPTED` as BallotStyleId;
  const precinctId = precinct.id;
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const votes: VotesDict = {};
  const ballot: CompletedBallot = {
    ballotHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: false,
    ballotType: BallotType.Precinct,
  };

  expect(() => encodeBallot(election, ballot)).toThrowError(
    `unknown ballot style id: ${ballotStyleId}`
  );
});

test('encodes & decodes candidate choice votes correctly', () => {
  const { election, ballotHash } = readElectionDefinition();
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const contests = getContests({ ballotStyle, election });
  const votes = vote(contests, {
    president: 'barchi-hallaren',
    senator: 'weiford',
    'representative-district-6': 'plunkard',
    governor: 'franz',
    'lieutenant-governor': 'norberg',
    'secretary-of-state': 'shamsi',
    'state-senator-district-31': 'shiplett',
    'state-assembly-district-54': 'solis',
    'county-commissioners': 'argent',
    'county-registrar-of-wills': 'ramachandrani',
    'city-mayor': 'white',
    'city-council': 'eagle',
  });
  const ballot: CompletedBallot = {
    ballotHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: false,
    ballotType: BallotType.Precinct,
  };
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false, length: 2 })
    .writeUint8(2)
    // ballot hash
    .writeString(ballotHash.slice(0, BALLOT_HASH_ENCODING_LENGTH), {
      encoding: HexEncoding,
      includeLength: false,
      length: BALLOT_HASH_ENCODING_LENGTH,
    })
    // precinct index
    .writeUint(0, { max: MAXIMUM_PRECINCTS })
    // ballot style index
    .writeUint(0, { max: MAXIMUM_BALLOT_STYLES })
    // test ballot?
    .writeBoolean(false)
    // ballot type
    .writeUint(precinctBallotTypeIndex, { max: BallotTypeMaximumValue })
    // ballot id?
    .writeBoolean(true)
    // ballot id
    .writeString('abcde')
    // vote roll call
    .writeBoolean(
      ...contests.map((contest) => isVotePresent(votes[contest.id]))
    )
    // vote data
    // - president (barchi-hallaren)
    .writeBoolean(true, ...falses(5))
    // - senator (weiford)
    .writeBoolean(true, ...falses(6))
    // - representative-district-6 (plunarkd)
    .writeBoolean(true, ...falses(4))
    // - governor (franz)
    .writeBoolean(true, ...falses(15))
    // - lieutenant-governor (norberg)
    .writeBoolean(true, ...falses(8))
    // - secretary-of-state (shamsi)
    .writeBoolean(true, false)
    // - state-senator-district-31 (shiplet)
    .writeBoolean(true)
    // - state-assembly-district-54 (solis)
    .writeBoolean(true, false, false)
    // - county-commissioners (argent)
    .writeBoolean(true, ...falses(10))
    // --- write-ins
    .writeUint(0, { max: 3 }) // 4 seats - 1 selection = 3 write-ins max
    // - county-registrar-of-wills (ramachandrani)
    .writeBoolean(true)
    // - city-mayor (white)
    .writeBoolean(true, false)
    // - city-council (eagle)
    .writeBoolean(true, ...falses(5))
    // --- write-ins
    .writeUint(0, { max: 2 }) // 3 seats - 1 selection = 2 write-ins max
    .toUint8Array();

  expect(encodeBallot(election, ballot)).toEqualBits(encodedBallot);
  expect(decodeBallot(election, encodedBallot)).toEqual({
    ...ballot,
    ballotHash: ballotHash.slice(0, BALLOT_HASH_ENCODING_LENGTH),
  });
});

test('encodes & decodes write-in votes correctly', () => {
  const { election, ballotHash } = readElectionDefinition();
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const contests = getContests({ ballotStyle, election });
  const votes = vote(contests, {
    'county-registrar-of-wills': [
      { id: 'write-in-MICKEY MOUSE', name: 'MICKEY MOUSE', isWriteIn: true },
    ],
  });
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const ballot: CompletedBallot = {
    ballotHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: false,
    ballotType: BallotType.Precinct,
  };
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false, length: 2 })
    .writeUint8(2)
    // ballot hash
    .writeString(ballotHash.slice(0, BALLOT_HASH_ENCODING_LENGTH), {
      encoding: HexEncoding,
      includeLength: false,
      length: BALLOT_HASH_ENCODING_LENGTH,
    })
    // precinct index
    .writeUint(0, { max: MAXIMUM_PRECINCTS })
    // ballot style index
    .writeUint(0, { max: MAXIMUM_BALLOT_STYLES })
    // test ballot?
    .writeBoolean(false)
    // ballot type
    .writeUint(precinctBallotTypeIndex, { max: BallotTypeMaximumValue })
    // ballot id?
    .writeBoolean(true)
    // ballot id
    .writeString('abcde')
    // vote roll call
    .writeBoolean(
      ...contests.map((contest) => isVotePresent(votes[contest.id]))
    )
    // vote data
    // - county-registrar-of-wills (ramachandrani)
    .writeBoolean(false)
    // --- write-ins
    .writeUint(1, { max: 1 }) // 1 seat - 0 selections = 1 max write-in
    .writeString('MICKEY MOUSE', {
      encoding: WriteInEncoding,
      maxLength: MAXIMUM_WRITE_IN_LENGTH,
    })
    .toUint8Array();

  expect(encodeBallot(election, ballot)).toEqualBits(encodedBallot);
  expect(decodeBallot(election, encodedBallot)).toEqual({
    ...ballot,
    ballotHash: ballotHash.slice(0, BALLOT_HASH_ENCODING_LENGTH),
  });
});

test('cannot decode a ballot without the prelude', () => {
  const { election } = readElectionDefinition();
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('XV', { includeLength: false, length: 2 })
    .writeUint8(2)
    .toUint8Array();

  expect(() => decodeBallot(election, encodedBallot)).toThrowError(
    "expected leading prelude 'V' 'X' 0b00000002 but it was not found"
  );
});

test('cannot decode a ballot that includes extra data at the end', () => {
  const { election, ballotHash } = readElectionDefinition();
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const contests = getContests({ election, ballotStyle });
  const votes = vote(contests, {});
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const ballot: CompletedBallot = {
    ballotHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: false,
    ballotType: BallotType.Precinct,
  };

  const writer = new BitWriter();

  encodeBallotInto(election, ballot, writer);

  const corruptedBallot = writer.writeBoolean(true).toUint8Array();

  expect(() => decodeBallot(election, corruptedBallot)).toThrowError(
    'unexpected data found while reading padding, expected EOF'
  );
});

test('cannot decode a ballot that includes too much padding at the end', () => {
  const { election, ballotHash } = readElectionDefinition();
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const contests = getContests({ election, ballotStyle });
  const votes = vote(contests, {});
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const ballot: CompletedBallot = {
    ballotHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: false,
    ballotType: BallotType.Precinct,
  };

  const writer = new BitWriter();

  encodeBallotInto(election, ballot, writer);

  const corruptedBallot = writer.writeUint8(0).toUint8Array();

  expect(() => decodeBallot(election, corruptedBallot)).toThrowError(
    'unexpected data found while reading padding, expected EOF'
  );
});

test('decode ballot hash from BMD metadata', () => {
  const { election, ballotHash } = readElectionDefinition();
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const contests = getContests({ ballotStyle, election });
  const votes = vote(contests, {});
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const ballot: CompletedBallot = {
    ballotHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: false,
    ballotType: BallotType.Precinct,
  };

  expect(decodeBallotHash(encodeBallot(election, ballot))).toEqual(
    ballotHash.slice(0, BALLOT_HASH_ENCODING_LENGTH)
  );
});

test('fails to find the ballot hash with garbage data', () => {
  expect(decodeBallotHash(Uint8Array.of(1, 2, 3))).toBeUndefined();
});

test('encode HMPB ballot page metadata', () => {
  const electionDefinition = readElectionDefinition();
  const { election } = electionDefinition;
  const ballotMetadata: HmpbBallotPageMetadata = {
    ballotHash: electionDefinition.ballotHash,
    precinctId: election.ballotStyles[0]!.precincts[0]!,
    ballotStyleId: election.ballotStyles[0]!.id,
    pageNumber: 3,
    isTestMode: true,
    ballotType: BallotType.Precinct,
  };

  const encoded = encodeHmpbBallotPageMetadata(election, ballotMetadata);

  const { ballotHash, ...ballotConfig } = ballotMetadata;
  const reader = new BitReader(encoded);
  expect(decodeBallotHashFromReader(reader)).toEqual(
    sliceBallotHashForEncoding(ballotHash)
  );
  expect(
    decodeBallotConfigFromReader(election, reader, { readPageNumber: true })
  ).toEqual(ballotConfig);
});

test('encode HMPB ballot page metadata with bad precinct fails', () => {
  const { election, ballotHash } = readElectionDefinition();
  const ballotMetadata: HmpbBallotPageMetadata = {
    ballotHash,
    precinctId: 'SanDimas', // not an actual precinct ID
    ballotStyleId: election.ballotStyles[0]!.id,
    pageNumber: 3,
    isTestMode: true,
    ballotType: BallotType.Precinct,
  };

  expect(() =>
    encodeHmpbBallotPageMetadata(election, ballotMetadata)
  ).toThrowError('precinct ID not found: SanDimas');
});

test('encode HMPB ballot page metadata with bad ballot style fails', () => {
  const { election, ballotHash } = readElectionDefinition();
  const ballotMetadata: HmpbBallotPageMetadata = {
    ballotHash,
    precinctId: election.ballotStyles[0]!.precincts[0]!,
    ballotStyleId: '42' as BallotStyleId, // not a good ballot style
    pageNumber: 3,
    isTestMode: true,
    ballotType: BallotType.Precinct,
  };

  expect(() =>
    encodeHmpbBallotPageMetadata(election, ballotMetadata)
  ).toThrowError('ballot style ID not found: 42');
});

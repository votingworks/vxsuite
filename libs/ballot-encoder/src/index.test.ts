import { electionGeneralDefinition as electionDefinition } from '@votingworks/fixtures';
import {
  BallotIdSchema,
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
import '../test/expect';
import { BitReader, BitWriter, toUint8 } from './bits';
import {
  decodeBallot,
  decodeElectionHash,
  isVxBallot,
  ELECTION_HASH_LENGTH,
  encodeBallot,
  encodeBallotInto,
  HexEncoding,
  MAXIMUM_WRITE_IN_LENGTH,
  BmdPrelude,
  WriteInEncoding,
  sliceElectionHash,
  encodeBallotConfigInto,
  encodeHmpbBallotPageMetadata,
  decodeElectionHashFromReader,
  decodeBallotConfigFromReader,
} from './index';

const precinctBallotTypeIndex = Object.values(BallotType).indexOf(
  BallotType.Precinct
);

function falses(count: number): boolean[] {
  return Array.from({ length: count }, () => false);
}

test('sliceElectionHash', () => {
  expect(sliceElectionHash('0000000000000000000000000')).toEqual(
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
  const { election, ballotHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const contests = getContests({ election, ballotStyle });
  const votes = vote(contests, {});
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const ballot: CompletedBallot = {
    electionHash: ballotHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: false,
    ballotType: BallotType.Precinct,
  };

  expect(decodeBallot(election, encodeBallot(election, ballot))).toEqual({
    ...ballot,
    electionHash: ballotHash.slice(0, ELECTION_HASH_LENGTH),
  });
});

test('encodes & decodes empty votes correctly', () => {
  const { election, ballotHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const contests = getContests({ ballotStyle, election });
  const votes = vote(contests, {});
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const ballot: CompletedBallot = {
    electionHash: ballotHash,
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
    // election hash
    .writeString(ballotHash.slice(0, ELECTION_HASH_LENGTH), {
      encoding: HexEncoding,
      includeLength: false,
      length: ELECTION_HASH_LENGTH,
    })
    // check data
    .writeUint8(
      toUint8(election.precincts.length),
      toUint8(election.ballotStyles.length),
      toUint8(election.contests.length)
    )
    // precinct index
    .writeUint(0, { max: election.precincts.length - 1 })
    // ballot style index
    .writeUint(0, { max: election.ballotStyles.length - 1 })
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
    electionHash: ballotHash.slice(0, ELECTION_HASH_LENGTH),
  });
});

test('encodes & decodes without a ballot id', () => {
  const { election, ballotHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const contests = getContests({ ballotStyle, election });
  const votes = vote(contests, {});
  const ballot: CompletedBallot = {
    electionHash: ballotHash,
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
    // election hash
    .writeString(ballotHash.slice(0, ELECTION_HASH_LENGTH), {
      encoding: HexEncoding,
      includeLength: false,
      length: ELECTION_HASH_LENGTH,
    })
    // check data
    .writeUint8(
      toUint8(election.precincts.length),
      toUint8(election.ballotStyles.length),
      toUint8(election.contests.length)
    )
    // precinct index
    .writeUint(0, { max: election.precincts.length - 1 })
    // ballot style index
    .writeUint(0, { max: election.ballotStyles.length - 1 })
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
    electionHash: ballotHash.slice(0, ELECTION_HASH_LENGTH),
  });
});

test('encodes & decodes whether it is a test ballot', () => {
  const { election, ballotHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const contests = getContests({ ballotStyle, election });
  const votes = vote(contests, {});
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const ballot: CompletedBallot = {
    electionHash: ballotHash,
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
    // election hash
    .writeString(ballotHash.slice(0, ELECTION_HASH_LENGTH), {
      encoding: HexEncoding,
      includeLength: false,
      length: ELECTION_HASH_LENGTH,
    })
    // check data
    .writeUint8(
      toUint8(election.precincts.length),
      toUint8(election.ballotStyles.length),
      toUint8(election.contests.length)
    )
    // precinct index
    .writeUint(0, { max: election.precincts.length - 1 })
    // ballot style index
    .writeUint(0, { max: election.ballotStyles.length - 1 })
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
    electionHash: ballotHash.slice(0, ELECTION_HASH_LENGTH),
  });
});

test('encodes & decodes the ballot type', () => {
  const { election, ballotHash } = electionDefinition;
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
    electionHash: ballotHash,
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
    // election hash
    .writeString(ballotHash.slice(0, ELECTION_HASH_LENGTH), {
      encoding: HexEncoding,
      includeLength: false,
      length: ELECTION_HASH_LENGTH,
    })
    // check data
    .writeUint8(
      toUint8(election.precincts.length),
      toUint8(election.ballotStyles.length),
      toUint8(election.contests.length)
    )
    // precinct index
    .writeUint(0, { max: election.precincts.length - 1 })
    // ballot style index
    .writeUint(0, { max: election.ballotStyles.length - 1 })
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
    electionHash: ballotHash.slice(0, ELECTION_HASH_LENGTH),
  });
});

test('encodes & decodes yesno votes correctly', () => {
  const { election, ballotHash } = electionDefinition;
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
    electionHash: ballotHash,
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
    // election hash
    .writeString(ballotHash.slice(0, ELECTION_HASH_LENGTH), {
      encoding: HexEncoding,
      includeLength: false,
      length: ELECTION_HASH_LENGTH,
    })
    // check data
    .writeUint8(
      toUint8(election.precincts.length),
      toUint8(election.ballotStyles.length),
      toUint8(election.contests.length)
    )
    // precinct index
    .writeUint(0, { max: election.precincts.length - 1 })
    // ballot style index
    .writeUint(0, { max: election.ballotStyles.length - 1 })
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
  const { election, ballotHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = 'not-a-precinct';
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const contests = getContests({ ballotStyle, election });
  const votes = vote(contests, {});
  const ballot: CompletedBallot = {
    electionHash: ballotHash,
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
  const { election } = electionDefinition;
  const precinct = election.precincts[0]!;
  const ballotStyleId = 'not-a-ballot-style';
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
  const { election, ballotHash } = electionDefinition;
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
    electionHash: ballotHash,
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
  const { election, ballotHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = `${ballotStyle.id}-CORRUPTED`;
  const precinctId = precinct.id;
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const votes: VotesDict = {};
  const ballot: CompletedBallot = {
    electionHash: ballotHash,
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

test('throws on decoding an incorrect number of precincts', () => {
  const { election, ballotHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const contests = getContests({ ballotStyle, election });
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false, length: 2 })
    .writeUint8(2)
    // election hash
    .writeString(ballotHash.slice(0, ELECTION_HASH_LENGTH), {
      encoding: HexEncoding,
      includeLength: false,
      length: ELECTION_HASH_LENGTH,
    })
    // check data
    .writeUint8(
      toUint8(election.precincts.length - 1), // INTENTIONALLY WRONG
      toUint8(election.ballotStyles.length),
      toUint8(election.contests.length)
    )
    // precinct index
    .writeUint(0, { max: election.precincts.length - 1 })
    // ballot style index
    .writeUint(0, { max: election.ballotStyles.length - 1 })
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

  expect(() => decodeBallot(election, encodedBallot)).toThrowError(
    'expected 3 precinct(s), but read 2 from encoded config'
  );
});

test('throws on decoding an incorrect number of ballot styles', () => {
  const { election, ballotHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const contests = getContests({ ballotStyle, election });
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false, length: 2 })
    .writeUint8(2)
    // election hash
    .writeString(ballotHash.slice(0, ELECTION_HASH_LENGTH), {
      encoding: HexEncoding,
      includeLength: false,
      length: ELECTION_HASH_LENGTH,
    })
    // check data
    .writeUint8(
      toUint8(election.precincts.length),
      toUint8(election.ballotStyles.length - 1), // INTENTIONALLY WRONG
      toUint8(election.contests.length)
    )
    // precinct index
    .writeUint(0, { max: election.precincts.length - 1 })
    // ballot style index
    .writeUint(0, { max: election.ballotStyles.length - 1 })
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

  expect(() => decodeBallot(election, encodedBallot)).toThrowError(
    'expected 2 ballot style(s), but read 1 from encoded config'
  );
});

test('throws on decoding an incorrect number of contests', () => {
  const { election, ballotHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const contests = getContests({ ballotStyle, election });
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false, length: 2 })
    .writeUint8(2)
    // election hash
    .writeString(ballotHash.slice(0, ELECTION_HASH_LENGTH), {
      encoding: HexEncoding,
      includeLength: false,
      length: ELECTION_HASH_LENGTH,
    })
    // check data
    .writeUint8(
      toUint8(election.precincts.length),
      toUint8(election.ballotStyles.length),
      toUint8(election.contests.length - 1) // INTENTIONALLY WRONG
    )
    // precinct index
    .writeUint(0, { max: election.precincts.length - 1 })
    // ballot style index
    .writeUint(0, { max: election.ballotStyles.length - 1 })
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

  expect(() => decodeBallot(election, encodedBallot)).toThrowError(
    'expected 20 contest(s), but read 19 from encoded config'
  );
});

test('encodes & decodes candidate choice votes correctly', () => {
  const { election, ballotHash } = electionDefinition;
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
    electionHash: ballotHash,
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
    // election hash
    .writeString(ballotHash.slice(0, ELECTION_HASH_LENGTH), {
      encoding: HexEncoding,
      includeLength: false,
      length: ELECTION_HASH_LENGTH,
    })
    // check data
    .writeUint8(
      toUint8(election.precincts.length),
      toUint8(election.ballotStyles.length),
      toUint8(election.contests.length)
    )
    // precinct index
    .writeUint(0, { max: election.precincts.length - 1 })
    // ballot style index
    .writeUint(0, { max: election.ballotStyles.length - 1 })
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
    electionHash: ballotHash.slice(0, ELECTION_HASH_LENGTH),
  });
});

test('encodes & decodes write-in votes correctly', () => {
  const { election, ballotHash } = electionDefinition;
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
    electionHash: ballotHash,
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
    // election hash
    .writeString(ballotHash.slice(0, ELECTION_HASH_LENGTH), {
      encoding: HexEncoding,
      includeLength: false,
      length: ELECTION_HASH_LENGTH,
    })
    // check data
    .writeUint8(
      toUint8(election.precincts.length),
      toUint8(election.ballotStyles.length),
      toUint8(election.contests.length)
    )
    // precinct index
    .writeUint(0, { max: election.precincts.length - 1 })
    // ballot style index
    .writeUint(0, { max: election.ballotStyles.length - 1 })
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
    electionHash: ballotHash.slice(0, ELECTION_HASH_LENGTH),
  });
});

test('cannot decode a ballot without the prelude', () => {
  const { election } = electionDefinition;
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('XV', { includeLength: false, length: 2 })
    .writeUint8(2)
    .toUint8Array();

  expect(() => decodeBallot(election, encodedBallot)).toThrowError(
    "expected leading prelude 'V' 'X' 0b00000002 but it was not found"
  );
});

test.skip('cannot decode a ballot with a ballot style ID not in the election', () => {
  const { election } = electionDefinition;
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false, length: 2 })
    .writeUint8(2)
    // ballot style id
    .writeString('ZZZ')
    // precinct id
    .writeString('23')
    // ballot Id
    .writeString('abcde')
    .toUint8Array();

  expect(() => decodeBallot(election, encodedBallot)).toThrowError(
    'ballot style with id "ZZZ" could not be found, expected one of: 12, 5, 7C'
  );
});

test.skip('cannot decode a ballot with a precinct ID not in the election', () => {
  const { election } = electionDefinition;
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false, length: 2 })
    .writeUint8(2)
    // check data
    .writeUint8(
      toUint8(election.precincts.length),
      toUint8(election.ballotStyles.length),
      toUint8(election.contests.length)
    )
    // ballot style index
    .writeUint(0, { max: election.ballotStyles.length - 1 })
    // precinct index (out of bounds)
    .writeUint(election.precincts.length, {
      max: election.precincts.length - 1,
    })
    // test mode
    .writeBoolean(true)
    // ballot Id
    .writeBoolean(false)
    .toUint8Array();

  expect(() => decodeBallot(election, encodedBallot)).toThrowError(
    'precinct with id "ZZZ" could not be found, expected one of: 23, 21, 20'
  );
});

test('cannot decode a ballot that includes extra data at the end', () => {
  const { election, ballotHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const contests = getContests({ election, ballotStyle });
  const votes = vote(contests, {});
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const ballot: CompletedBallot = {
    electionHash: ballotHash,
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
  const { election, ballotHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const contests = getContests({ election, ballotStyle });
  const votes = vote(contests, {});
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const ballot: CompletedBallot = {
    electionHash: ballotHash,
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

test('decode election hash from BMD metadata', () => {
  const { election, ballotHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const contests = getContests({ ballotStyle, election });
  const votes = vote(contests, {});
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const ballot: CompletedBallot = {
    electionHash: ballotHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: false,
    ballotType: BallotType.Precinct,
  };

  expect(decodeElectionHash(encodeBallot(election, ballot))).toEqual(
    ballotHash.slice(0, ELECTION_HASH_LENGTH)
  );
});

test('fails to find the election hash with garbage data', () => {
  expect(decodeElectionHash(Uint8Array.of(1, 2, 3))).toBeUndefined();
});

test('encode HMPB ballot page metadata', () => {
  const { election } = electionDefinition;
  const ballotMetadata: HmpbBallotPageMetadata = {
    electionHash: electionDefinition.ballotHash,
    precinctId: election.ballotStyles[0]!.precincts[0]!,
    ballotStyleId: election.ballotStyles[0]!.id,
    pageNumber: 3,
    isTestMode: true,
    ballotType: BallotType.Precinct,
  };

  const encoded = encodeHmpbBallotPageMetadata(election, ballotMetadata);

  const { electionHash, ...ballotConfig } = ballotMetadata;
  const reader = new BitReader(encoded);
  expect(decodeElectionHashFromReader(reader)).toEqual(
    sliceElectionHash(electionHash)
  );
  expect(
    decodeBallotConfigFromReader(election, reader, { readPageNumber: true })
  ).toEqual(ballotConfig);
});

test('encode HMPB ballot page metadata with bad precinct fails', () => {
  const { election, ballotHash } = electionDefinition;
  const ballotMetadata: HmpbBallotPageMetadata = {
    electionHash: ballotHash,
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
  const { election, ballotHash } = electionDefinition;
  const ballotMetadata: HmpbBallotPageMetadata = {
    electionHash: ballotHash,
    precinctId: election.ballotStyles[0]!.precincts[0]!,
    ballotStyleId: '42', // not a good ballot style
    pageNumber: 3,
    isTestMode: true,
    ballotType: BallotType.Precinct,
  };

  expect(() =>
    encodeHmpbBallotPageMetadata(election, ballotMetadata)
  ).toThrowError('ballot style ID not found: 42');
});

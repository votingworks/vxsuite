import {
  electionSampleLongContentDefinition as electionDefinition,
  electionWithMsEitherNeitherDefinition,
} from '@votingworks/fixtures';
import {
  BallotIdSchema,
  BallotType,
  BallotTypeMaximumValue,
  Candidate,
  CompletedBallot,
  getContests,
  HmpbBallotPageMetadata,
  isVotePresent,
  unsafeParse,
  Vote,
  vote,
  VotesDict,
} from '@votingworks/types';
import '../test/expect';
import { BitWriter, toUint8, Utf8Encoding } from './bits';
import {
  decodeBallot,
  decodeElectionHash,
  decodeHmpbBallotPageMetadata,
  detectRawBytesBmdBallot,
  detectHmpbBallotPageMetadata,
  isHmpbMetadata,
  isVxBallot,
  ELECTION_HASH_LENGTH,
  encodeBallot,
  encodeBallotInto,
  encodeHmpbBallotPageMetadata,
  HexEncoding,
  MAXIMUM_WRITE_IN_LENGTH,
  Prelude,
  HmpbPrelude,
  WriteInEncoding,
  sliceElectionHash,
} from './index';

function falses(count: number): boolean[] {
  return Array.from({ length: count }, () => false);
}

test('sliceElectionHash', () => {
  expect(sliceElectionHash('0000000000000000000000000')).toEqual(
    '00000000000000000000'
  );
});

test('can detect an encoded ballot', () => {
  expect(detectRawBytesBmdBallot(Uint8Array.of(...Prelude))).toEqual(true);
  expect(detectRawBytesBmdBallot(Uint8Array.of())).toEqual(false);
  expect(detectRawBytesBmdBallot(Uint8Array.of(0, ...Prelude))).toEqual(false);
  expect(
    detectRawBytesBmdBallot(Uint8Array.of(...Prelude.slice(0, -2)))
  ).toEqual(false);

  expect(isVxBallot(Uint8Array.of(...Prelude))).toEqual(true);
  expect(isVxBallot(Uint8Array.of())).toEqual(false);
  expect(isVxBallot(Uint8Array.of(0, ...Prelude))).toEqual(false);
  expect(isVxBallot(Uint8Array.of(...Prelude.slice(0, -2)))).toEqual(false);
});

test('can detect an hmpb ballot', () => {
  expect(isHmpbMetadata(Uint8Array.of(...HmpbPrelude))).toEqual(true);
  expect(isHmpbMetadata(Uint8Array.of())).toEqual(false);
  expect(isHmpbMetadata(Uint8Array.of(0, ...HmpbPrelude))).toEqual(false);
  expect(isHmpbMetadata(Uint8Array.of(...HmpbPrelude.slice(0, -2)))).toEqual(
    false
  );

  expect(isVxBallot(Uint8Array.of(...HmpbPrelude))).toEqual(true);
  expect(isVxBallot(Uint8Array.of())).toEqual(false);
  expect(isVxBallot(Uint8Array.of(0, ...HmpbPrelude))).toEqual(false);
  expect(isVxBallot(Uint8Array.of(...HmpbPrelude.slice(0, -2)))).toEqual(false);
});

test('can detect our legacy formats', () => {
  const hmpbMetadata =
    'https://ballot.page/?t=_&pr=23&bs=12&l1=en-US&l2=es-US&p=5-5';
  const bmdData = 'https://vx.vote/?t=_&pr=42&bs=77&p=2-2';

  expect(isVxBallot(Utf8Encoding.encode(hmpbMetadata))).toEqual(true);
  expect(isVxBallot(Utf8Encoding.encode(bmdData))).toEqual(true);
});

test('encodes & decodes with Uint8Array as the standard encoding interface', () => {
  const { election, electionHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const contests = getContests({ election, ballotStyle });
  const votes = vote(contests, {});
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const ballot: CompletedBallot = {
    electionHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: false,
    ballotType: BallotType.Standard,
  };

  expect(decodeBallot(election, encodeBallot(election, ballot))).toEqual({
    ...ballot,
    electionHash: electionHash.slice(0, ELECTION_HASH_LENGTH),
  });
});

it('encodes & decodes empty votes correctly', () => {
  const { election, electionHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const contests = getContests({ ballotStyle, election });
  const votes = vote(contests, {});
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const ballot: CompletedBallot = {
    electionHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: false,
    ballotType: BallotType.Standard,
  };
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false, length: 2 })
    .writeUint8(2)
    // election hash
    .writeString(electionHash.slice(0, ELECTION_HASH_LENGTH), {
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
    .writeUint(BallotType.Standard, { max: BallotTypeMaximumValue })
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
    electionHash: electionHash.slice(0, ELECTION_HASH_LENGTH),
  });
});

it('encodes & decodes without a ballot id', () => {
  const { election, electionHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const contests = getContests({ ballotStyle, election });
  const votes = vote(contests, {});
  const ballot: CompletedBallot = {
    electionHash,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: false,
    ballotType: BallotType.Standard,
  };
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false, length: 2 })
    .writeUint8(2)
    // election hash
    .writeString(electionHash.slice(0, ELECTION_HASH_LENGTH), {
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
    .writeUint(BallotType.Standard, { max: BallotTypeMaximumValue })
    // ballot id?
    .writeBoolean(false)
    // vote roll call only, no vote data
    .writeBoolean(...contests.map(() => false))
    .toUint8Array();

  expect(encodeBallot(election, ballot)).toEqualBits(encodedBallot);
  expect(decodeBallot(election, encodedBallot)).toEqual({
    ...ballot,
    electionHash: electionHash.slice(0, ELECTION_HASH_LENGTH),
  });
});

it('encodes & decodes whether it is a test ballot', () => {
  const { election, electionHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const contests = getContests({ ballotStyle, election });
  const votes = vote(contests, {});
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const ballot: CompletedBallot = {
    electionHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: true,
    ballotType: BallotType.Standard,
  };
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false, length: 2 })
    .writeUint8(2)
    // election hash
    .writeString(electionHash.slice(0, ELECTION_HASH_LENGTH), {
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
    .writeUint(BallotType.Standard, { max: BallotTypeMaximumValue })
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
    electionHash: electionHash.slice(0, ELECTION_HASH_LENGTH),
  });
});

it('encodes & decodes the ballot type', () => {
  const { election, electionHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const contests = getContests({ ballotStyle, election });
  const votes = vote(contests, {});
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const ballot: CompletedBallot = {
    electionHash,
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
    .writeString(electionHash.slice(0, ELECTION_HASH_LENGTH), {
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
    .writeUint(BallotType.Absentee, { max: BallotTypeMaximumValue })
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
    electionHash: electionHash.slice(0, ELECTION_HASH_LENGTH),
  });
});

it('encodes & decodes yesno votes correctly', () => {
  const { election, electionHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const contests = getContests({ ballotStyle, election });
  const votes = vote(contests, {
    'judicial-robert-demergue': ['yes'],
    'judicial-elmer-hull': ['yes'],
    'question-a': ['yes'],
    'question-b': ['no'],
    'question-c': ['yes'],
    'proposition-1': [],
    'measure-101': ['no'],
    '102': ['yes'],
  });
  const ballot: CompletedBallot = {
    electionHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: false,
    ballotType: BallotType.Standard,
  };
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false, length: 2 })
    .writeUint8(2)
    // election hash
    .writeString(electionHash.slice(0, ELECTION_HASH_LENGTH), {
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
    .writeUint(BallotType.Standard, { max: BallotTypeMaximumValue })
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

it('encodes & decodes ms-either-neither votes correctly', () => {
  const { election, electionHash } = electionWithMsEitherNeitherDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts.find(
    (p) => p.id === ballotStyle.precincts[0]!
  )!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const contests = getContests({ ballotStyle, election });
  const votePermutations: Array<{
    [key: string]: Vote | string | string[] | Candidate;
  }> = [
    { '750000015': ['yes'], '750000016': ['no'] },
    { '750000015': ['yes'], '750000016': ['yes'] },
    { '750000015': ['no'], '750000016': ['no'] },
    { '750000015': ['no'], '750000016': ['yes'] },
    { '750000016': ['yes'] },
    { '750000015': ['no'] },
    {},
  ];

  for (const rawVote of votePermutations) {
    const votes = vote(contests, rawVote);
    const ballot: CompletedBallot = {
      electionHash,
      ballotId,
      ballotStyleId,
      precinctId,
      votes,
      isTestMode: false,
      ballotType: BallotType.Standard,
    };
    const encodedBallot = new BitWriter()
      // prelude + version number
      .writeString('VX', { includeLength: false, length: 2 })
      .writeUint8(2)
      // election hash
      .writeString(electionHash.slice(0, ELECTION_HASH_LENGTH), {
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
      .writeUint(election.precincts.indexOf(precinct), {
        max: election.precincts.length - 1,
      })
      // ballot style index
      .writeUint(election.ballotStyles.indexOf(ballotStyle), {
        max: election.ballotStyles.length - 1,
      })
      // test ballot?
      .writeBoolean(false)
      // ballot type
      .writeUint(BallotType.Standard, { max: BallotTypeMaximumValue })
      // ballot id?
      .writeBoolean(true)
      // ballot id
      .writeString('abcde')
      // vote roll call
      .with((bits) => {
        for (const contest of contests) {
          if (contest.id === '750000015-either-neither') {
            bits.writeBoolean('750000015' in rawVote);
            bits.writeBoolean('750000016' in rawVote);
          } else {
            bits.writeBoolean(isVotePresent(votes[contest.id]));
          }
        }
      })
      // vote data
      .with((bits) => {
        if (Array.isArray(rawVote['750000015'])) {
          bits.writeBoolean(rawVote['750000015'][0] === 'yes');
        }
        if (Array.isArray(rawVote['750000016'])) {
          bits.writeBoolean(rawVote['750000016'][0] === 'yes');
        }
      })
      .toUint8Array();

    expect(encodeBallot(election, ballot)).toEqualBits(encodedBallot);
    expect(
      encodeBallot(election, decodeBallot(election, encodedBallot))
    ).toEqual(encodedBallot);
  }
});

it('throws on trying to encode a bad yes/no vote', () => {
  const { election, electionHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const contests = getContests({ ballotStyle, election });
  const votes = vote(contests, {
    'judicial-robert-demergue': 'yes',
  });
  const ballot: CompletedBallot = {
    electionHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: false,
    ballotType: BallotType.Standard,
  };

  expect(() => encodeBallot(election, ballot)).toThrowError(
    'cannot encode a non-array yes/no vote: "yes"'
  );

  // overvotes fail too.
  ballot.votes['judicial-robert-demergue'] = ['yes', 'no'];
  expect(() => encodeBallot(election, ballot)).toThrowError(
    'cannot encode a yes/no overvote: ["yes","no"]'
  );
});

it('throws on trying to encode a ballot style', () => {
  const { election, electionHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = `${ballotStyle.id}-CORRUPTED`;
  const precinctId = precinct.id;
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const votes: VotesDict = {};
  const ballot: CompletedBallot = {
    electionHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: false,
    ballotType: BallotType.Standard,
  };

  expect(() => encodeBallot(election, ballot)).toThrowError(
    `unknown ballot style id: ${ballotStyleId}`
  );
});

test('throws on decoding an incorrect number of precincts', () => {
  const { election, electionHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const contests = getContests({ ballotStyle, election });
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false, length: 2 })
    .writeUint8(2)
    // election hash
    .writeString(electionHash.slice(0, ELECTION_HASH_LENGTH), {
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
    .writeUint(BallotType.Standard, { max: BallotTypeMaximumValue })
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
  const { election, electionHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const contests = getContests({ ballotStyle, election });
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false, length: 2 })
    .writeUint8(2)
    // election hash
    .writeString(electionHash.slice(0, ELECTION_HASH_LENGTH), {
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
    .writeUint(BallotType.Standard, { max: BallotTypeMaximumValue })
    // ballot id?
    .writeBoolean(true)
    // ballot id
    .writeString('abcde')
    // vote roll call only, no vote data
    .writeBoolean(...contests.map(() => false))
    .toUint8Array();

  expect(() => decodeBallot(election, encodedBallot)).toThrowError(
    'expected 3 ballot style(s), but read 2 from encoded config'
  );
});

test('throws on decoding an incorrect number of contests', () => {
  const { election, electionHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const contests = getContests({ ballotStyle, election });
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false, length: 2 })
    .writeUint8(2)
    // election hash
    .writeString(electionHash.slice(0, ELECTION_HASH_LENGTH), {
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
    .writeUint(BallotType.Standard, { max: BallotTypeMaximumValue })
    // ballot id?
    .writeBoolean(true)
    // ballot id
    .writeString('abcde')
    // vote roll call only, no vote data
    .writeBoolean(...contests.map(() => false))
    .toUint8Array();

  expect(() => decodeBallot(election, encodedBallot)).toThrowError(
    'expected 22 contest(s), but read 21 from encoded config'
  );
});

it('encodes & decodes candidate choice votes correctly', () => {
  const { election, electionHash } = electionDefinition;
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
    electionHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: false,
    ballotType: BallotType.Standard,
  };
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false, length: 2 })
    .writeUint8(2)
    // election hash
    .writeString(electionHash.slice(0, ELECTION_HASH_LENGTH), {
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
    .writeUint(BallotType.Standard, { max: BallotTypeMaximumValue })
    // ballot id?
    .writeBoolean(true)
    // ballot id
    .writeString('abcde')
    // vote roll call
    .writeBoolean(...contests.map((contest) => contest.id in votes))
    // vote data
    // - president (barchi-hallaren)
    .writeBoolean(true, ...falses(5))
    // - senator (weiford)
    .writeBoolean(true, ...falses(6))
    // - representative-district-6 (plunarkd)
    .writeBoolean(true, ...falses(4))
    // - governor (franz)
    .writeBoolean(true, ...falses(25))
    // - lieutenant-governor (norberg)
    .writeBoolean(true, ...falses(8))
    // - secretary-of-state (shamsi)
    .writeBoolean(true, false)
    // - state-senator-district-31 (shiplet)
    .writeBoolean(true)
    // - state-assembly-district-54 (solis)
    .writeBoolean(true, false, false)
    // - county-commissioners (argent)
    .writeBoolean(true, ...falses(14))
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
    electionHash: electionHash.slice(0, ELECTION_HASH_LENGTH),
  });
});

it('encodes & decodes write-in votes correctly', () => {
  const { election, electionHash } = electionDefinition;
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
    electionHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: false,
    ballotType: BallotType.Standard,
  };
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false, length: 2 })
    .writeUint8(2)
    // election hash
    .writeString(electionHash.slice(0, ELECTION_HASH_LENGTH), {
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
    .writeUint(BallotType.Standard, { max: BallotTypeMaximumValue })
    // ballot id?
    .writeBoolean(true)
    // ballot id
    .writeString('abcde')
    // vote roll call
    .writeBoolean(...contests.map((contest) => contest.id in votes))
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
    electionHash: electionHash.slice(0, ELECTION_HASH_LENGTH),
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
  const { election, electionHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const contests = getContests({ election, ballotStyle });
  const votes = vote(contests, {});
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const ballot: CompletedBallot = {
    electionHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: false,
    ballotType: BallotType.Standard,
  };

  const writer = new BitWriter();

  encodeBallotInto(election, ballot, writer);

  const corruptedBallot = writer.writeBoolean(true).toUint8Array();

  expect(() => decodeBallot(election, corruptedBallot)).toThrowError(
    'unexpected data found while reading padding, expected EOF'
  );
});

test('cannot decode a ballot that includes too much padding at the end', () => {
  const { election, electionHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const contests = getContests({ election, ballotStyle });
  const votes = vote(contests, {});
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const ballot: CompletedBallot = {
    electionHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: false,
    ballotType: BallotType.Standard,
  };

  const writer = new BitWriter();

  encodeBallotInto(election, ballot, writer);

  const corruptedBallot = writer.writeUint8(0).toUint8Array();

  expect(() => decodeBallot(election, corruptedBallot)).toThrowError(
    'unexpected data found while reading padding, expected EOF'
  );
});

test('encode and decode HMPB ballot page metadata', () => {
  const { election, electionHash } = electionDefinition;
  const ballotMetadata: HmpbBallotPageMetadata = {
    electionHash,
    precinctId: election.ballotStyles[0]!.precincts[0]!,
    ballotStyleId: election.ballotStyles[0]!.id,
    locales: {
      primary: 'en-US',
    },
    pageNumber: 3,
    isTestMode: true,
    ballotType: BallotType.Standard,
  };

  const encoded = encodeHmpbBallotPageMetadata(election, ballotMetadata);
  const decoded = decodeHmpbBallotPageMetadata(election, encoded);
  expect(decoded).toEqual(ballotMetadata);

  // corrupt the first byte and expect it to fail
  encoded[0] = 42;
  expect(() => decodeHmpbBallotPageMetadata(election, encoded)).toThrowError();
});

test('encode and decode HMPB ballot page metadata with ballot ID', () => {
  const { election, electionHash } = electionWithMsEitherNeitherDefinition;
  const ballotMetadata: HmpbBallotPageMetadata = {
    electionHash,
    precinctId: election.ballotStyles[2]!.precincts[1]!,
    ballotStyleId: election.ballotStyles[2]!.id,
    locales: {
      primary: 'en-US',
      secondary: 'es-US',
    },
    pageNumber: 2,
    isTestMode: false,
    ballotType: BallotType.Absentee,
    ballotId: unsafeParse(BallotIdSchema, 'foobar'),
  };

  const encoded = encodeHmpbBallotPageMetadata(election, ballotMetadata);
  const decoded = decodeHmpbBallotPageMetadata(election, encoded);
  expect(decoded).toEqual(ballotMetadata);
});

test('encode HMPB ballot page metadata with bad precinct fails', () => {
  const { election, electionHash } = electionDefinition;
  const ballotMetadata: HmpbBallotPageMetadata = {
    electionHash,
    precinctId: 'SanDimas', // not an actual precinct ID
    ballotStyleId: election.ballotStyles[0]!.id,
    locales: {
      primary: 'en-US',
    },
    pageNumber: 3,
    isTestMode: true,
    ballotType: BallotType.Standard,
  };

  expect(() =>
    encodeHmpbBallotPageMetadata(election, ballotMetadata)
  ).toThrowError('precinct ID not found: SanDimas');
});

test('encode HMPB ballot page metadata with bad ballot style fails', () => {
  const { election, electionHash } = electionDefinition;
  const ballotMetadata: HmpbBallotPageMetadata = {
    electionHash,
    precinctId: election.ballotStyles[0]!.precincts[0]!,
    ballotStyleId: '42', // not a good ballot style
    locales: {
      primary: 'en-US',
    },
    pageNumber: 3,
    isTestMode: true,
    ballotType: BallotType.Standard,
  };

  expect(() =>
    encodeHmpbBallotPageMetadata(election, ballotMetadata)
  ).toThrowError('ballot style ID not found: 42');
});

test('encode HMPB ballot page metadata with bad primary locale', () => {
  const { election, electionHash } = electionDefinition;
  const ballotMetadata: HmpbBallotPageMetadata = {
    electionHash,
    precinctId: election.ballotStyles[0]!.precincts[0]!,
    ballotStyleId: election.ballotStyles[0]!.id,
    locales: {
      primary: 'fr-CA', // not a supported locale
    },
    pageNumber: 3,
    isTestMode: true,
    ballotType: BallotType.Standard,
  };

  expect(() =>
    encodeHmpbBallotPageMetadata(election, ballotMetadata)
  ).toThrowError('primary locale not found: fr-CA');
});

test('encode HMPB ballot page metadata with bad secondary locale', () => {
  const { election, electionHash } = electionDefinition;
  const ballotMetadata: HmpbBallotPageMetadata = {
    electionHash,
    precinctId: election.ballotStyles[0]!.precincts[0]!,
    ballotStyleId: election.ballotStyles[0]!.id,
    locales: {
      primary: 'en-US',
      secondary: 'fr-CA', // not a supported locale
    },
    pageNumber: 3,
    isTestMode: true,
    ballotType: BallotType.Standard,
  };

  expect(() =>
    encodeHmpbBallotPageMetadata(election, ballotMetadata)
  ).toThrowError('secondary locale not found: fr-CA');
});

test('detect HMPB ballot page metadata', () => {
  const { election, electionHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = ballotStyle.precincts[0]!;
  const ballotMetadata: HmpbBallotPageMetadata = {
    electionHash,
    precinctId,
    ballotStyleId: ballotStyle.id,
    locales: {
      primary: 'en-US',
    },
    pageNumber: 3,
    isTestMode: true,
    ballotType: BallotType.Standard,
  };

  // empty
  expect(detectHmpbBallotPageMetadata(Uint8Array.of())).toEqual(false);

  // gibberish
  expect(detectHmpbBallotPageMetadata(Uint8Array.of(1, 2, 3))).toEqual(false);

  // HMPB
  expect(
    detectHmpbBallotPageMetadata(
      encodeHmpbBallotPageMetadata(election, ballotMetadata)
    )
  ).toEqual(true);

  // BMD
  expect(
    detectHmpbBallotPageMetadata(
      encodeBallot(election, {
        electionHash,
        ballotStyleId,
        precinctId,
        ballotType: BallotType.Standard,
        isTestMode: false,
        votes: {},
      })
    )
  ).toEqual(false);
});

test('decode election hash from HMPB metadata', () => {
  const { election, electionHash } = electionDefinition;
  const ballotMetadata: HmpbBallotPageMetadata = {
    electionHash,
    precinctId: election.ballotStyles[0]!.precincts[0]!,
    ballotStyleId: election.ballotStyles[0]!.id,
    locales: { primary: 'en-US' },
    pageNumber: 3,
    isTestMode: true,
    ballotType: BallotType.Standard,
  };

  expect(
    decodeElectionHash(encodeHmpbBallotPageMetadata(election, ballotMetadata))
  ).toEqual(electionHash);
});

test('decode election hash from BMD metadata', () => {
  const { election, electionHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const ballotStyleId = ballotStyle.id;
  const precinctId = precinct.id;
  const contests = getContests({ ballotStyle, election });
  const votes = vote(contests, {});
  const ballotId = unsafeParse(BallotIdSchema, 'abcde');
  const ballot: CompletedBallot = {
    electionHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode: false,
    ballotType: BallotType.Standard,
  };

  expect(decodeElectionHash(encodeBallot(election, ballot))).toEqual(
    electionHash.slice(0, ELECTION_HASH_LENGTH)
  );
});

test('fails to find the election hash with garbage data', () => {
  expect(decodeElectionHash(Uint8Array.of(1, 2, 3))).toBeUndefined();
});

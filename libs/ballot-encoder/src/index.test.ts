import { expect, test } from 'vitest';
import { readElectionGeneralDefinition as readElectionDefinition } from '@votingworks/fixtures';
import {
  BallotType,
  Candidate,
  CandidateContest,
  getContests,
  HmpbBallotPageMetadata,
  vote,
  VotesDict,
} from '@votingworks/types';
import {
  decodeBallotHash,
  isVxBallot,
  BALLOT_HASH_ENCODING_LENGTH,
  SummaryBallotPrelude,
  sliceBallotHashForEncoding,
  encodeHmpbBallotPageMetadata,
  encodeSummaryBallotPage,
  encodeSummaryBallotPageInto,
  decodeSummaryBallotPage,
  SummaryBallotPage,
} from '.';
import { BitWriter } from './bits';

test('sliceBallotHashForEncoding', () => {
  expect(sliceBallotHashForEncoding('0000000000000000000000000')).toEqual(
    '00000000000000000000'
  );
});

test('can detect an encoded ballot', () => {
  expect(isVxBallot(Uint8Array.of(...SummaryBallotPrelude))).toEqual(true);
  expect(isVxBallot(Uint8Array.of())).toEqual(false);
  expect(isVxBallot(Uint8Array.of(0, ...SummaryBallotPrelude))).toEqual(false);
  expect(
    isVxBallot(Uint8Array.of(...SummaryBallotPrelude.slice(0, -2)))
  ).toEqual(false);
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
    ballotAuditId: 'test-ballot-audit-id',
  };

  const encoded = encodeHmpbBallotPageMetadata(election, ballotMetadata);

  // We can at least verify that the ballot hash decodes from the encoded
  // metadata. There is no public HMPB metadata decoder in ballot-encoder.
  expect(decodeBallotHash(encoded)).toEqual(
    sliceBallotHashForEncoding(ballotMetadata.ballotHash)
  );
});

test('encode HMPB ballot page metadata without a ballot audit id', () => {
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

  expect(decodeBallotHash(encoded)).toEqual(
    sliceBallotHashForEncoding(ballotMetadata.ballotHash)
  );
});

test('encode HMPB ballot page metadata with bad precinct fails', () => {
  const electionDefinition = readElectionDefinition();
  const { election, ballotHash } = electionDefinition;
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
  const electionDefinition = readElectionDefinition();
  const { election, ballotHash } = electionDefinition;
  const ballotMetadata: HmpbBallotPageMetadata = {
    ballotHash,
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

// Multi-page summary ballot tests

test('multi-page summary ballot is detected as VX ballot', () => {
  const electionDefinition = readElectionDefinition();
  const { election, ballotHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const contests = getContests({ election, ballotStyle });

  const page: SummaryBallotPage = {
    ballotHash,
    ballotStyleId: ballotStyle.id,
    precinctId: precinct.id,
    isTestMode: false,
    ballotType: BallotType.Precinct,
    pageNumber: 1,
    totalPages: 2,
    ballotAuditId: 'test-audit-id-123',
    contests: contests.slice(0, 5), // first 5 contests
    votes: vote(contests.slice(0, 5), {}),
  };

  const encoded = encodeSummaryBallotPage(election, page);
  expect(isVxBallot(encoded)).toEqual(true);
});

test('encodes & decodes multi-page summary ballot with empty votes', () => {
  const electionDefinition = readElectionDefinition();
  const { election, ballotHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const contests = getContests({ election, ballotStyle });
  const pageContests = contests.slice(0, 5); // first 5 contests
  const votes = vote(pageContests, {});

  const page: SummaryBallotPage = {
    ballotHash,
    ballotStyleId: ballotStyle.id,
    precinctId: precinct.id,
    isTestMode: false,
    ballotType: BallotType.Precinct,
    pageNumber: 1,
    totalPages: 2,
    ballotAuditId: 'test-audit-id-123',
    contests: pageContests,
    votes,
  };

  const encoded = encodeSummaryBallotPage(election, page);
  const decoded = decodeSummaryBallotPage(electionDefinition, encoded);

  expect(decoded.metadata.ballotHash).toEqual(
    ballotHash.slice(0, BALLOT_HASH_ENCODING_LENGTH)
  );
  expect(decoded.metadata.ballotStyleId).toEqual(ballotStyle.id);
  expect(decoded.metadata.precinctId).toEqual(precinct.id);
  expect(decoded.metadata.isTestMode).toEqual(false);
  expect(decoded.metadata.ballotType).toEqual(BallotType.Precinct);
  expect(decoded.metadata.pageNumber).toEqual(1);
  expect(decoded.metadata.totalPages).toEqual(2);
  expect(decoded.metadata.ballotAuditId).toEqual('test-audit-id-123');
  expect(decoded.metadata.contestIds).toEqual(pageContests.map((c) => c.id));
  expect(decoded.votes).toEqual(votes);
});

test('encodes & decodes multi-page summary ballot with votes', () => {
  const electionDefinition = readElectionDefinition();
  const { election, ballotHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const contests = getContests({ election, ballotStyle });
  const pageContests = contests.slice(0, 5);
  const votes = vote(pageContests, {
    president: 'barchi-hallaren',
    senator: 'weiford',
  });

  const page: SummaryBallotPage = {
    ballotHash,
    ballotStyleId: ballotStyle.id,
    precinctId: precinct.id,
    isTestMode: true,
    ballotType: BallotType.Absentee,
    pageNumber: 2,
    totalPages: 3,
    ballotAuditId: 'ballot-audit-xyz',
    contests: pageContests,
    votes,
  };

  const encoded = encodeSummaryBallotPage(election, page);
  const decoded = decodeSummaryBallotPage(electionDefinition, encoded);

  expect(decoded.metadata.isTestMode).toEqual(true);
  expect(decoded.metadata.ballotType).toEqual(BallotType.Absentee);
  expect(decoded.metadata.pageNumber).toEqual(2);
  expect(decoded.metadata.totalPages).toEqual(3);
  expect(decoded.metadata.ballotAuditId).toEqual('ballot-audit-xyz');
  expect(decoded.votes).toEqual(votes);
});

test('encodes & decodes multi-page summary ballot with write-in votes', () => {
  const electionDefinition = readElectionDefinition();
  const { election, ballotHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const contests = getContests({ election, ballotStyle });
  // county-commissioners has 4 seats and allows write-ins. Vote a mix of a
  // named candidate and a write-in so both the named and write-in branches of
  // the per-choice encoding are exercised, with room left for the write-in.
  const pageContests = contests.filter((c) => c.id === 'county-commissioners');
  const namedCandidate = (pageContests[0] as CandidateContest).candidates[0]!;
  const writeIn: Candidate = {
    id: 'write-in-DONALD DUCK',
    name: 'DONALD DUCK',
    isWriteIn: true,
  };
  const votes: VotesDict = {
    'county-commissioners': [namedCandidate, writeIn],
  };

  const page: SummaryBallotPage = {
    ballotHash,
    ballotStyleId: ballotStyle.id,
    precinctId: precinct.id,
    isTestMode: false,
    ballotType: BallotType.Precinct,
    pageNumber: 1,
    totalPages: 1,
    ballotAuditId: 'single-page-audit-id',
    contests: pageContests,
    votes,
  };

  const encoded = encodeSummaryBallotPage(election, page);
  const decoded = decodeSummaryBallotPage(electionDefinition, encoded);

  expect(decoded.metadata.pageNumber).toEqual(1);
  expect(decoded.metadata.totalPages).toEqual(1);
  expect(decoded.votes['county-commissioners']).toEqual([
    namedCandidate,
    writeIn,
  ]);
});

test('encodes & decodes write-in contest with no room for write-ins', () => {
  const electionDefinition = readElectionDefinition();
  const { election, ballotHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const contests = getContests({ election, ballotStyle });
  // county-registrar-of-wills allows write-ins but has a single seat. Filling
  // that seat with a named candidate leaves no room for write-ins, exercising
  // the maximumWriteIns === 0 branch on both encode and decode.
  const pageContests = contests.filter(
    (c) => c.id === 'county-registrar-of-wills'
  );
  const votes = vote(pageContests, {
    'county-registrar-of-wills': ['ramachandrani'],
  });

  const page: SummaryBallotPage = {
    ballotHash,
    ballotStyleId: ballotStyle.id,
    precinctId: precinct.id,
    isTestMode: false,
    ballotType: BallotType.Precinct,
    pageNumber: 1,
    totalPages: 1,
    ballotAuditId: 'no-write-in-room-audit-id',
    contests: pageContests,
    votes,
  };

  const encoded = encodeSummaryBallotPage(election, page);
  const decoded = decodeSummaryBallotPage(electionDefinition, encoded);

  expect(decoded.votes).toEqual(votes);
});

test('encodes & decodes multi-page summary ballot with yes/no votes', () => {
  const electionDefinition = readElectionDefinition();
  const { election, ballotHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const contests = getContests({ election, ballotStyle });
  const yesNoContestIds = [
    'judicial-robert-demergue',
    'judicial-elmer-hull',
    'question-a',
  ];
  const pageContests = contests.filter((c) => yesNoContestIds.includes(c.id));
  // Mix yes and no answers so both decode branches are exercised.
  const votes = vote(pageContests, {
    'judicial-robert-demergue': ['judicial-robert-demergue-option-yes'],
    'judicial-elmer-hull': ['judicial-elmer-hull-option-no'],
    'question-a': ['question-a-option-yes'],
  });

  const page: SummaryBallotPage = {
    ballotHash,
    ballotStyleId: ballotStyle.id,
    precinctId: precinct.id,
    isTestMode: false,
    ballotType: BallotType.Precinct,
    pageNumber: 1,
    totalPages: 1,
    ballotAuditId: 'yesno-audit-id',
    contests: pageContests,
    votes,
  };

  const encoded = encodeSummaryBallotPage(election, page);
  const decoded = decodeSummaryBallotPage(electionDefinition, encoded);

  expect(decoded.votes).toEqual(votes);
});

test('throws on trying to encode a bad yes/no vote', () => {
  const electionDefinition = readElectionDefinition();
  const { election, ballotHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const contests = getContests({ election, ballotStyle });
  const pageContests = contests.filter(
    (c) => c.id === 'judicial-robert-demergue'
  );

  const page: SummaryBallotPage = {
    ballotHash,
    ballotStyleId: ballotStyle.id,
    precinctId: precinct.id,
    isTestMode: false,
    ballotType: BallotType.Precinct,
    pageNumber: 1,
    totalPages: 1,
    ballotAuditId: 'bad-yesno-audit-id',
    contests: pageContests,
    votes: {
      'judicial-robert-demergue':
        'judicial-robert-demergue-option-yes' as unknown as string[],
    },
  };

  expect(() => encodeSummaryBallotPage(election, page)).toThrowError(
    'cannot encode a non-array ballot measure vote: "judicial-robert-demergue-option-yes"'
  );

  // Overvotes fail too.
  page.votes['judicial-robert-demergue'] = [
    'judicial-robert-demergue-option-yes',
    'judicial-robert-demergue-option-no',
  ];
  expect(() => encodeSummaryBallotPage(election, page)).toThrowError(
    'cannot encode a ballot measure overvote: ["judicial-robert-demergue-option-yes","judicial-robert-demergue-option-no"]'
  );
});

function buildEmptyVotesBmdPage(): {
  electionDefinition: ReturnType<typeof readElectionDefinition>;
  page: SummaryBallotPage;
} {
  const electionDefinition = readElectionDefinition();
  const { election, ballotHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const pageContests = getContests({ election, ballotStyle }).slice(0, 5);

  return {
    electionDefinition,
    page: {
      ballotHash,
      ballotStyleId: ballotStyle.id,
      precinctId: precinct.id,
      isTestMode: false,
      ballotType: BallotType.Precinct,
      pageNumber: 1,
      totalPages: 1,
      ballotAuditId: 'padding-audit-id',
      contests: pageContests,
      votes: vote(pageContests, {}),
    },
  };
}

test('cannot decode a summary ballot that includes extra data at the end', () => {
  const { electionDefinition, page } = buildEmptyVotesBmdPage();
  const { election } = electionDefinition;

  const corrupted = encodeSummaryBallotPageInto(election, page, new BitWriter())
    .writeBoolean(true)
    .toUint8Array();

  expect(() =>
    decodeSummaryBallotPage(electionDefinition, corrupted)
  ).toThrowError('unexpected data found while reading padding, expected EOF');
});

test('cannot decode a summary ballot that includes too much padding at the end', () => {
  const { electionDefinition, page } = buildEmptyVotesBmdPage();
  const { election } = electionDefinition;

  const corrupted = encodeSummaryBallotPageInto(election, page, new BitWriter())
    .writeUint8(0)
    .toUint8Array();

  expect(() =>
    decodeSummaryBallotPage(electionDefinition, corrupted)
  ).toThrowError('unexpected data found while reading padding, expected EOF');
});

test('decode ballot hash from summary ballot metadata', () => {
  const electionDefinition = readElectionDefinition();
  const { election, ballotHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;
  const precinct = election.precincts[0]!;
  const contests = getContests({ election, ballotStyle });

  const page: SummaryBallotPage = {
    ballotHash,
    ballotStyleId: ballotStyle.id,
    precinctId: precinct.id,
    isTestMode: false,
    ballotType: BallotType.Precinct,
    pageNumber: 1,
    totalPages: 2,
    ballotAuditId: 'audit-id',
    contests: contests.slice(0, 3),
    votes: vote(contests.slice(0, 3), {}),
  };

  const encoded = encodeSummaryBallotPage(election, page);
  expect(decodeBallotHash(encoded)).toEqual(
    ballotHash.slice(0, BALLOT_HASH_ENCODING_LENGTH)
  );
});

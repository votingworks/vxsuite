import {
  BallotType,
  Candidate,
  CandidateVote,
  Contest,
  ContestId,
  Election,
  ElectionDefinition,
  HmpbBallotPageMetadata,
  SoftwareVersion,
  StraightPartyVote,
  VotesDict,
  YesNoVote,
  getBallotStyle,
  getContests,
} from '@votingworks/types';
import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { napi } from './napi';
import {
  RustCandidateVote,
  RustCastVoteRecord,
  RustContestVote,
} from './rust_types';
import {
  BALLOT_HASH_ENCODING_LENGTH,
  DecodedSummaryBallotPage,
  SummaryBallotPage,
  sliceBallotHashForEncoding,
} from '.';

/**
 * The same encoders and decoders as the rest of this package, backed by the
 * Rust implementation in `libs/types-rs` rather than the TypeScript one. Kept
 * separate for now so the two can be compared; see
 * `specs/0007-consolidate-ballot-encoding-in-rust.md`.
 */

function toRustVote(
  contest: Contest,
  vote: NonNullable<unknown>
): RustContestVote {
  switch (contest.type) {
    case 'candidate': {
      const value: RustCandidateVote[] = (vote as CandidateVote).map(
        (candidate) =>
          candidate.isWriteIn
            ? {
                type: 'writeInCandidate',
                candidateId: candidate.id,
                name: candidate.name,
              }
            : { type: 'namedCandidate', candidateId: candidate.id }
      );
      return { type: 'candidate', value };
    }
    case 'yesno':
      return { type: 'yesNo', value: [...(vote as YesNoVote)] };
    case 'straight-party':
      return { type: 'straightParty', value: [...(vote as StraightPartyVote)] };
    /* istanbul ignore next */
    default:
      return throwIllegalValue(contest);
  }
}

function fromRustVote(contest: Contest, vote: RustContestVote) {
  switch (vote.type) {
    case 'candidate':
      return vote.value.map((candidateVote): Candidate => {
        if (candidateVote.type === 'writeInCandidate') {
          return {
            id: candidateVote.candidateId,
            name: candidateVote.name,
            isWriteIn: true,
          };
        }
        assert(contest.type === 'candidate');
        return assertDefined(
          contest.candidates.find((c) => c.id === candidateVote.candidateId)
        );
      });
    case 'yesNo':
    case 'straightParty':
      return vote.value;
    /* istanbul ignore next */
    default:
      return throwIllegalValue(vote);
  }
}

/**
 * Encodes bubble ballot page metadata using the Rust implementation.
 */
export function encodeHmpbBallotPageMetadata(
  election: Election,
  metadata: HmpbBallotPageMetadata,
  version: SoftwareVersion
): Uint8Array {
  return new Uint8Array(
    napi.encodeHmpbBallotPageMetadata(
      election,
      {
        ballotHash: sliceBallotHashForEncoding(metadata.ballotHash),
        precinctId: metadata.precinctId,
        ballotStyleId: metadata.ballotStyleId,
        pageNumber: metadata.pageNumber,
        isTestMode: metadata.isTestMode,
        ballotType: metadata.ballotType,
        ballotAuditId: metadata.ballotAuditId,
      },
      version
    )
  );
}

/**
 * Encodes one page of a summary ballot using the Rust implementation.
 */
export function encodeSummaryBallotPage(
  election: Election,
  page: SummaryBallotPage
): Uint8Array {
  const contestIdsOnPage = new Set(page.contests.map((c) => c.id));
  const ballotStyle = assertDefined(
    getBallotStyle({ ballotStyleId: page.ballotStyleId, election })
  );
  // The encoder needs contests in the ballot style's canonical order, which is
  // the order the decoder walks them in.
  const contests = getContests({ ballotStyle, election }).filter((c) =>
    contestIdsOnPage.has(c.id)
  );

  const votes: Record<ContestId, RustContestVote> = {};
  for (const contest of contests) {
    const vote = page.votes[contest.id];
    if (vote && vote.length > 0) {
      votes[contest.id] = toRustVote(contest, vote);
    }
  }

  const record: RustCastVoteRecord = {
    ballotHash: [
      ...Buffer.from(sliceBallotHashForEncoding(page.ballotHash), 'hex'),
    ],
    ballotStyleId: page.ballotStyleId,
    precinctId: page.precinctId,
    pageNumber: page.pageNumber,
    totalPages: page.totalPages,
    isTestMode: page.isTestMode,
    ballotType: page.ballotType,
    ballotAuditId: page.ballotAuditId,
    contestIds: contests.map((c) => c.id),
    votes,
  };

  return new Uint8Array(napi.encodeSummaryBallotPage(election, record));
}

/**
 * Decodes one page of a summary ballot using the Rust implementation.
 */
export function decodeSummaryBallotPage(
  electionDefinition: ElectionDefinition,
  data: Uint8Array
): DecodedSummaryBallotPage {
  const { election } = electionDefinition;
  const record = napi.decodeSummaryBallotPage(election, Buffer.from(data));

  const ballotHash = Buffer.from(record.ballotHash).toString('hex');
  assert(
    ballotHash === sliceBallotHashForEncoding(electionDefinition.ballotHash),
    `unexpected ballot hash '${ballotHash}' (expected '${electionDefinition.ballotHash}')`
  );

  const ballotStyle = assertDefined(
    getBallotStyle({ ballotStyleId: record.ballotStyleId, election })
  );
  const contestsById = new Map(
    getContests({ ballotStyle, election }).map((c) => [c.id, c])
  );

  const votes: VotesDict = {};
  for (const contestId of record.contestIds) {
    const contest = assertDefined(contestsById.get(contestId));
    const vote = record.votes[contestId];
    votes[contestId] = vote ? fromRustVote(contest, vote) : [];
  }

  return {
    metadata: {
      ballotHash,
      ballotStyleId: record.ballotStyleId,
      precinctId: record.precinctId,
      pageNumber: record.pageNumber,
      totalPages: record.totalPages,
      isTestMode: record.isTestMode,
      ballotType: record.ballotType as BallotType,
      ballotAuditId: record.ballotAuditId,
      contestIds: record.contestIds,
    },
    votes,
  };
}

/**
 * Reads the partial ballot hash out of an encoded payload of either kind.
 */
export function decodeBallotHash(data: Uint8Array): string | undefined {
  return napi.decodeBallotHash(Buffer.from(data)) ?? undefined;
}

/**
 * Detects whether `data` is an encoded summary ballot page.
 */
export function isVxBallot(data: Uint8Array): boolean {
  return napi.isVxBallot(Buffer.from(data));
}

/** Re-exported so callers need not reach into the TypeScript implementation. */
export const ballotHashEncodingLength = BALLOT_HASH_ENCODING_LENGTH;

/** Re-exported so callers need not reach into the TypeScript implementation. */
export const sliceHashForEncoding = sliceBallotHashForEncoding;

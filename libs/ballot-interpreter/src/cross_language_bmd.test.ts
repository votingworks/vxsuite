import { expect, test } from 'vitest';
import fc from 'fast-check';
import {
  AnyContest,
  BallotType,
  BallotStyleId,
  Contests,
  Election,
  VotesDict,
  getContests,
  getBallotStyle,
  Candidate,
  YesNoVote,
} from '@votingworks/types';
import {
  decodeBallot,
  decodeBmdMultiPageBallot,
  encodeBallot,
  encodeBmdMultiPageBallot,
  BmdMultiPageBallotPage,
  sliceBallotHashForEncoding,
} from '@votingworks/ballot-encoder';
import {
  arbitraryBallotId,
  arbitraryElectionDefinition,
} from '@votingworks/test-utils';
import { Buffer } from 'node:buffer';
import assert from 'node:assert';
import { napi } from './bubble-ballot-ts/napi';
import type {
  BridgeDecodeBmdResult,
  RustCandidateVote,
  RustContestVote,
} from './bubble-ballot-ts/types';

/**
 * Generates votes for a set of contests. For candidate contests, selects up
 * to `seats` named candidates (plus a write-in if there's room and
 * `includeWriteIns` is set). For yes/no contests, picks yes.
 */
function generateVotesForContests(
  contests: Contests,
  includeWriteIns: boolean
): VotesDict {
  const votes: VotesDict = {};
  for (const contest of contests) {
    if (contest.type === 'candidate') {
      const namedCandidates = contest.candidates.filter((c) => !c.isWriteIn);
      const selected = namedCandidates.slice(0, contest.seats);
      if (
        includeWriteIns &&
        contest.allowWriteIns &&
        selected.length < contest.seats
      ) {
        votes[contest.id] = [
          ...selected,
          {
            id: 'write-in-TEST',
            name: 'TEST',
            isWriteIn: true,
          },
        ];
      } else {
        votes[contest.id] = selected;
      }
    } else {
      votes[contest.id] = [contest.yesOption.id];
    }
  }
  return votes;
}

/**
 * Converts a Rust-decoded ballot hash (array of bytes) to the hex string
 * format used by the TypeScript encoder.
 */
function rustBallotHashToHex(bytes: number[]): string {
  return Buffer.from(bytes).toString('hex');
}

/**
 * Simplified vote representation for cross-language comparison: candidate
 * contests map to arrays of candidate IDs, yes/no to option ID strings.
 */
type NormalizedVotes = Record<string, string | string[]>;

/**
 * Normalizes Rust vote format for comparison. Rust uses discriminated
 * unions: `{ type: "candidate", value: [...] }` and
 * `{ type: "yesNo", value: "option-id" }`.
 */
function normalizeRustVotes(
  rustVotes: Record<string, RustContestVote>,
  election: Election,
  ballotStyleId: BallotStyleId
): NormalizedVotes {
  const ballotStyle = getBallotStyle({ ballotStyleId, election });
  if (!ballotStyle) return {};
  const contests = getContests({ ballotStyle, election });

  const normalized: NormalizedVotes = {};
  for (const [contestId, rustVote] of Object.entries(rustVotes)) {
    const contest = contests.find((c) => c.id === contestId);
    if (!contest) continue;

    if (rustVote.type === 'candidate') {
      normalized[contestId] = rustVote.value.map((cv) => cv.candidateId);
    } else {
      normalized[contestId] = rustVote.value;
    }
  }
  return normalized;
}

/**
 * Normalizes TypeScript VotesDict for comparison: candidate votes become
 * arrays of candidate IDs, yes/no votes become the selected option ID.
 */
function normalizeTsVotes(votes: Record<string, unknown>): NormalizedVotes {
  const normalized: NormalizedVotes = {};
  for (const [contestId, vote] of Object.entries(votes)) {
    if (!vote) continue;
    const voteArr = vote as unknown[];
    if (voteArr.length === 0) continue;

    const first = voteArr[0];
    if (typeof first === 'string') {
      normalized[contestId] = first;
    } else if (typeof first === 'object' && first !== null && 'id' in first) {
      normalized[contestId] = voteArr.map((c) => (c as { id: string }).id);
    }
  }
  return normalized;
}

// To replay a failure, set seed and path from the counterexample output:
// e.g. { seed: 736549880, path: "31:0:0:0:0", numRuns: 1 }
const SINGLE_PAGE_FC_PARAMS: fc.Parameters<unknown> = { numRuns: 50 };

test('single-page BMD ballot: TS encode matches Rust decode', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryElectionDefinition(),
      fc.boolean(),
      fc.constantFrom(
        BallotType.Precinct,
        BallotType.Absentee,
        BallotType.Provisional
      ),
      fc.boolean(),
      async (
        { election, ballotHash },
        isTestMode,
        ballotType,
        includeWriteIns
      ) => {
        const ballotStyle = election.ballotStyles[0];
        if (!ballotStyle) return;
        const precinct = election.precincts.find((p) =>
          ballotStyle.precincts.includes(p.id)
        );
        if (!precinct) return;

        const contests = getContests({ ballotStyle, election });
        if (contests.length === 0) return;

        const votes = generateVotesForContests(contests, includeWriteIns);

        const encoded = encodeBallot(election, {
          ballotHash,
          ballotStyleId: ballotStyle.id,
          precinctId: precinct.id,
          votes,
          isTestMode,
          ballotType,
        });

        const result = await napi.decodeBmdBallotData(
          election,
          Buffer.from(encoded)
        );

        assert(result.type === 'singlePage');
        const { value } = result;

        expect(rustBallotHashToHex(value.ballotHash)).toEqual(
          sliceBallotHashForEncoding(ballotHash)
        );
        expect(value.ballotStyleId).toEqual(ballotStyle.id);
        expect(value.precinctId).toEqual(precinct.id);
        expect(value.isTestMode).toEqual(isTestMode);

        const rustVotes = normalizeRustVotes(
          value.votes,
          election,
          ballotStyle.id
        );
        const tsVotes = normalizeTsVotes(votes);
        expect(rustVotes).toEqual(tsVotes);
      }
    ),
    SINGLE_PAGE_FC_PARAMS
  );
});

// To replay a failure, set seed and path from the counterexample output:
// e.g. { seed: 736549880, path: "31:0:0:0:0", numRuns: 1 }
const MULTI_PAGE_FC_PARAMS: fc.Parameters<unknown> = { numRuns: 50 };

test('multi-page BMD ballot: TS encode matches Rust decode', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryElectionDefinition(),
      fc.boolean(),
      fc.constantFrom(
        BallotType.Precinct,
        BallotType.Absentee,
        BallotType.Provisional
      ),
      fc.integer({ min: 1, max: 5 }),
      arbitraryBallotId(),
      fc.boolean(),
      async (
        { election, ballotHash },
        isTestMode,
        ballotType,
        totalPages,
        ballotAuditId,
        includeWriteIns
      ) => {
        const ballotStyle = election.ballotStyles[0];
        if (!ballotStyle) return;
        const precinct = election.precincts.find((p) =>
          ballotStyle.precincts.includes(p.id)
        );
        if (!precinct) return;

        const allContests = getContests({ ballotStyle, election });
        if (allContests.length === 0) return;

        // Distribute contests across pages round-robin
        const pages: Array<AnyContest[]> = Array.from(
          { length: totalPages },
          () => []
        );
        for (const [i, contest] of allContests.entries()) {
          pages[i % totalPages]!.push(contest);
        }

        for (const [pageIdx, pageContests] of pages.entries()) {
          const pageNumber = pageIdx + 1;
          const votes = generateVotesForContests(pageContests, includeWriteIns);

          const page: BmdMultiPageBallotPage = {
            ballotHash,
            ballotStyleId: ballotStyle.id,
            precinctId: precinct.id,
            isTestMode,
            ballotType,
            pageNumber,
            totalPages,
            ballotAuditId,
            contests: pageContests,
            votes,
          };

          const encoded = encodeBmdMultiPageBallot(election, page);

          const result = await napi.decodeBmdBallotData(
            election,
            Buffer.from(encoded)
          );

          assert(result.type === 'multiPage');
          const { value } = result;

          expect(rustBallotHashToHex(value.ballotHash)).toEqual(
            sliceBallotHashForEncoding(ballotHash)
          );
          expect(value.ballotStyleId).toEqual(ballotStyle.id);
          expect(value.precinctId).toEqual(precinct.id);
          expect(value.isTestMode).toEqual(isTestMode);
          expect(value.pageNumber).toEqual(pageNumber);
          expect(value.totalPages).toEqual(totalPages);

          const expectedContestIds = pageContests.map((c) => c.id);
          expect(value.contestIds).toEqual(expectedContestIds);

          const rustVotes = normalizeRustVotes(
            value.votes,
            election,
            ballotStyle.id
          );
          const tsVotes = normalizeTsVotes(votes);
          expect(rustVotes).toEqual(tsVotes);
        }
      }
    ),
    MULTI_PAGE_FC_PARAMS
  );
});

/**
 * Converts a hex ballot hash string to the byte array format Rust expects.
 */
function ballotHashToBytes(ballotHash: string): number[] {
  return Array.from(Buffer.from(sliceBallotHashForEncoding(ballotHash), 'hex'));
}

/**
 * Converts TS VotesDict to Rust contest vote format for encoding input.
 */
function tsVotesToRustVotes(
  votes: VotesDict,
  contests: Contests
): Record<string, RustContestVote> {
  const rustVotes: Record<string, RustContestVote> = {};
  for (const contest of contests) {
    const vote = votes[contest.id];
    if (!vote) continue;
    const voteArr = vote as unknown[];
    if (voteArr.length === 0) continue;

    if (contest.type === 'candidate') {
      const candidates: RustCandidateVote[] = voteArr.map((c) => {
        const candidate = c as Candidate;
        if (candidate.isWriteIn) {
          return {
            type: 'writeInCandidate',
            candidateId: candidate.id,
            name: candidate.name ?? '',
          };
        }
        return {
          type: 'namedCandidate',
          candidateId: candidate.id,
        };
      });
      rustVotes[contest.id] = { type: 'candidate', value: candidates };
    } else {
      const optionId = (voteArr as YesNoVote)[0]!;
      rustVotes[contest.id] = { type: 'yesNo', value: optionId };
    }
  }
  return rustVotes;
}

test('single-page BMD ballot: Rust encode matches TS decode', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryElectionDefinition(),
      fc.boolean(),
      fc.constantFrom(
        BallotType.Precinct,
        BallotType.Absentee,
        BallotType.Provisional
      ),
      fc.boolean(),
      async (
        { election, ballotHash },
        isTestMode,
        ballotType,
        includeWriteIns
      ) => {
        const ballotStyle = election.ballotStyles[0];
        if (!ballotStyle) return;
        const precinct = election.precincts.find((p) =>
          ballotStyle.precincts.includes(p.id)
        );
        if (!precinct) return;

        const contests = getContests({ ballotStyle, election });
        if (contests.length === 0) return;

        const votes = generateVotesForContests(contests, includeWriteIns);

        const rustRecord: BridgeDecodeBmdResult = {
          type: 'singlePage',
          value: {
            ballotHash: ballotHashToBytes(ballotHash),
            ballotStyleId: ballotStyle.id,
            precinctId: precinct.id,
            isTestMode,
            ballotType,
            ballotAuditId: null,
            votes: tsVotesToRustVotes(votes, contests),
          },
        };

        const encoded = await napi.encodeBmdBallotData(election, rustRecord);

        const decoded = decodeBallot(election, new Uint8Array(encoded));

        expect(decoded.ballotStyleId).toEqual(ballotStyle.id);
        expect(decoded.precinctId).toEqual(precinct.id);
        expect(decoded.isTestMode).toEqual(isTestMode);

        const tsVotes = normalizeTsVotes(votes);
        const decodedVotes = normalizeTsVotes(decoded.votes);
        expect(decodedVotes).toEqual(tsVotes);
      }
    ),
    { numRuns: 50 }
  );
});

test('multi-page BMD ballot: Rust encode matches TS decode', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryElectionDefinition(),
      fc.boolean(),
      fc.constantFrom(
        BallotType.Precinct,
        BallotType.Absentee,
        BallotType.Provisional
      ),
      fc.integer({ min: 1, max: 5 }),
      arbitraryBallotId(),
      fc.boolean(),
      async (
        { election, ballotHash },
        isTestMode,
        ballotType,
        totalPages,
        ballotAuditId,
        includeWriteIns
      ) => {
        const ballotStyle = election.ballotStyles[0];
        if (!ballotStyle) return;
        const precinct = election.precincts.find((p) =>
          ballotStyle.precincts.includes(p.id)
        );
        if (!precinct) return;

        const allContests = getContests({ ballotStyle, election });
        if (allContests.length === 0) return;

        const pages: Array<AnyContest[]> = Array.from(
          { length: totalPages },
          () => []
        );
        for (const [i, contest] of allContests.entries()) {
          pages[i % totalPages]!.push(contest);
        }

        for (const [pageIdx, pageContests] of pages.entries()) {
          const pageNumber = pageIdx + 1;
          const votes = generateVotesForContests(pageContests, includeWriteIns);

          const rustRecord: BridgeDecodeBmdResult = {
            type: 'multiPage',
            value: {
              ballotHash: ballotHashToBytes(ballotHash),
              ballotStyleId: ballotStyle.id,
              precinctId: precinct.id,
              pageNumber,
              totalPages,
              isTestMode,
              ballotType,
              ballotAuditId,
              contestIds: pageContests.map((c) => c.id),
              votes: tsVotesToRustVotes(votes, pageContests),
            },
          };

          const encoded = await napi.encodeBmdBallotData(election, rustRecord);

          const decoded = decodeBmdMultiPageBallot(
            election,
            new Uint8Array(encoded)
          );

          expect(decoded.metadata.ballotStyleId).toEqual(ballotStyle.id);
          expect(decoded.metadata.precinctId).toEqual(precinct.id);
          expect(decoded.metadata.isTestMode).toEqual(isTestMode);
          expect(decoded.metadata.pageNumber).toEqual(pageNumber);
          expect(decoded.metadata.totalPages).toEqual(totalPages);
          expect(decoded.metadata.contestIds).toEqual(
            pageContests.map((c) => c.id)
          );

          const tsVotes = normalizeTsVotes(votes);
          const decodedVotes = normalizeTsVotes(decoded.votes);
          expect(decodedVotes).toEqual(tsVotes);
        }
      }
    ),
    MULTI_PAGE_FC_PARAMS
  );
});

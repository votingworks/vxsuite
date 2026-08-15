import { expect, test } from 'vitest';
import fc from 'fast-check';
import {
  Contest,
  BallotType,
  BallotStyleId,
  Election,
  VotesDict,
  getContests,
  getBallotStyle,
  Candidate,
  YesNoVote,
} from '@votingworks/types';
import {
  decodeSummaryBallotPage,
  encodeSummaryBallotPage,
  SummaryBallotPage,
  sliceBallotHashForEncoding,
} from '@votingworks/ballot-encoder';
import { arbitraryBallotId } from '@votingworks/test-utils';
import {
  electionCombinedBallotPrimaryFixtures,
  electionFamousNames2021Fixtures,
  electionStraightPartyFixtures,
  electionTwoPartyPrimaryFixtures,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import { Buffer } from 'node:buffer';
import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import { napi } from './bubble-ballot-ts/napi';
import type {
  BridgeDecodeBmdResult,
  RustCandidateVote,
  RustContestVote,
} from './bubble-ballot-ts/types';

/**
 * Real elections rather than `arbitraryElectionDefinition`. That generator
 * picks each ballot style's districts independently of the contests' districts,
 * so `getContests` comes back empty and the properties below used to skip their
 * bodies on 49 of every 50 runs — including every case that would have caught
 * the contest-selection divergence this commit fixes.
 */
function arbitraryFixtureElectionDefinition() {
  return fc.constantFrom(
    readElectionGeneralDefinition(),
    electionFamousNames2021Fixtures.readElectionDefinition(),
    electionTwoPartyPrimaryFixtures.readElectionDefinition(),
    electionStraightPartyFixtures.readElectionDefinition(),
    electionCombinedBallotPrimaryFixtures.readElectionDefinition()
  );
}

/**
 * Generates votes for a set of contests. For candidate contests, selects up
 * to `seats` named candidates (plus a write-in if there's room and
 * `includeWriteIns` is set). For yes/no contests, picks yes.
 */
function generateVotesForContests(
  contests: readonly Contest[],
  includeWriteIns: boolean
): VotesDict {
  const votes: VotesDict = {};
  for (const contest of contests) {
    switch (contest.type) {
      case 'candidate': {
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
        break;
      }
      case 'yesno': {
        votes[contest.id] = [contest.options[0].id];
        break;
      }
      case 'straight-party': {
        votes[contest.id] = contest.optionIds.slice(0, 1);
        break;
      }
      default:
        throwIllegalValue(contest);
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
 * contests map to arrays of candidate IDs, yes/no and straight-party to arrays
 * of option/party IDs.
 */
type NormalizedVotes = Record<string, string | string[]>;

/**
 * Normalizes Rust vote format for comparison. Rust uses discriminated
 * unions: `{ type: "candidate", value: [...] }` and
 * `{ type: "yesNo", value: ["option-id"] }`.
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
 * arrays of candidate IDs, and yes/no and straight-party votes become arrays of
 * option/party IDs (matching the Rust side).
 */
function normalizeTsVotes(votes: Record<string, unknown>): NormalizedVotes {
  const normalized: NormalizedVotes = {};
  for (const [contestId, vote] of Object.entries(votes)) {
    if (!vote) continue;
    const voteArr = vote as unknown[];
    if (voteArr.length === 0) continue;

    const first = voteArr[0];
    if (typeof first === 'string') {
      // Both straight-party and yesno/measure votes are string[] and stay as
      // arrays (matching the Rust side, which encodes one bit per option).
      normalized[contestId] = voteArr as string[];
    } else if (typeof first === 'object' && first !== null && 'id' in first) {
      normalized[contestId] = voteArr.map((c) => (c as { id: string }).id);
    }
  }
  return normalized;
}

// To replay a failure, set seed and path from the counterexample output:
// e.g. { seed: 736549880, path: "31:0:0:0:0", numRuns: 1 }
const MULTI_PAGE_FC_PARAMS: fc.Parameters<unknown> = { numRuns: 50 };

test('multi-page BMD ballot: TS encode matches Rust decode', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryFixtureElectionDefinition(),
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
        const ballotStyle = assertDefined(election.ballotStyles[0]);
        const precinct = assertDefined(
          election.precincts.find((p) => ballotStyle.precincts.includes(p.id))
        );

        const allContests = getContests({ ballotStyle, election });
        expect(allContests.length).toBeGreaterThan(0);

        // Distribute contests across pages round-robin
        const pages: Array<Contest[]> = Array.from(
          { length: totalPages },
          () => []
        );
        for (const [i, contest] of allContests.entries()) {
          pages[i % totalPages]!.push(contest);
        }

        for (const [pageIdx, pageContests] of pages.entries()) {
          const pageNumber = pageIdx + 1;
          const votes = generateVotesForContests(pageContests, includeWriteIns);

          const page: SummaryBallotPage = {
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

          const encoded = encodeSummaryBallotPage(election, page);

          const result = await napi.decodeBmdBallotData(
            election,
            Buffer.from(encoded)
          );

          expect(rustBallotHashToHex(result.ballotHash)).toEqual(
            sliceBallotHashForEncoding(ballotHash)
          );
          expect(result.ballotStyleId).toEqual(ballotStyle.id);
          expect(result.precinctId).toEqual(precinct.id);
          expect(result.isTestMode).toEqual(isTestMode);
          expect(result.pageNumber).toEqual(pageNumber);
          expect(result.totalPages).toEqual(totalPages);

          const expectedContestIds = pageContests.map((c) => c.id);
          expect(result.contestIds).toEqual(expectedContestIds);

          const rustVotes = normalizeRustVotes(
            result.votes,
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
  contests: readonly Contest[]
): Record<string, RustContestVote> {
  const rustVotes: Record<string, RustContestVote> = {};
  for (const contest of contests) {
    const vote = votes[contest.id];
    if (!vote) continue;
    const voteArr = vote as unknown[];
    if (voteArr.length === 0) continue;

    switch (contest.type) {
      case 'candidate': {
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
        break;
      }
      case 'yesno': {
        const optionIds = voteArr as YesNoVote;
        rustVotes[contest.id] = { type: 'yesNo', value: [...optionIds] };
        break;
      }
      case 'straight-party': {
        const partyIds = voteArr as string[];
        rustVotes[contest.id] = { type: 'straightParty', value: partyIds };
        break;
      }
      default:
        throwIllegalValue(contest);
    }
  }
  return rustVotes;
}

test('multi-page BMD ballot: Rust encode matches TS decode', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryFixtureElectionDefinition(),
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
        electionDefinition,
        isTestMode,
        ballotType,
        totalPages,
        ballotAuditId,
        includeWriteIns
      ) => {
        const { election, ballotHash } = electionDefinition;
        const ballotStyle = assertDefined(election.ballotStyles[0]);
        const precinct = assertDefined(
          election.precincts.find((p) => ballotStyle.precincts.includes(p.id))
        );

        const allContests = getContests({ ballotStyle, election });
        expect(allContests.length).toBeGreaterThan(0);

        const pages: Array<Contest[]> = Array.from(
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
          };

          const encoded = await napi.encodeBmdBallotData(election, rustRecord);

          const decoded = decodeSummaryBallotPage(
            electionDefinition,
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

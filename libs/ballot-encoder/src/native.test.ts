import { describe, expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import {
  BallotType,
  Contest,
  ElectionDefinition,
  HmpbBallotPageMetadata,
  SoftwareVersion,
  VotesDict,
  getContests,
} from '@votingworks/types';
import {
  electionCombinedBallotPrimaryFixtures,
  electionFamousNames2021Fixtures,
  electionStraightPartyFixtures,
  electionTwoPartyPrimaryFixtures,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import {
  decodeBallotHash,
  decodeSummaryBallotPage,
  encodeHmpbBallotPageMetadata,
  encodeSummaryBallotPage,
  isVxBallot,
  sliceBallotHashForEncoding,
} from '.';
import goldenPayloads from '../test/golden_payloads.json';

/**
 * These byte vectors were produced by the TypeScript implementation that used
 * to live in this package, captured immediately before it was deleted. They are
 * the wire format: every ballot in the field was printed by the code that
 * produced them, so a change here is a change to what scanners must read, not a
 * test that needs updating.
 */

const ELECTIONS: Record<string, ElectionDefinition> = {
  general: readElectionGeneralDefinition(),
  famousNames: electionFamousNames2021Fixtures.readElectionDefinition(),
  twoPartyPrimary: electionTwoPartyPrimaryFixtures.readElectionDefinition(),
  straightParty: electionStraightPartyFixtures.readElectionDefinition(),
  combinedBallotPrimary:
    electionCombinedBallotPrimaryFixtures.readElectionDefinition(),
};

/**
 * Mirrors the vote generation used when the golden vectors were captured.
 */
function votesFor(
  contests: readonly Contest[],
  includeWriteIns: boolean
): VotesDict {
  const votes: VotesDict = {};
  for (const [i, contest] of contests.entries()) {
    if (i % 4 === 3) continue;
    switch (contest.type) {
      case 'yesno':
        votes[contest.id] = [contest.options[0].id];
        break;
      case 'straight-party':
        votes[contest.id] = [contest.optionIds[0]!];
        break;
      case 'candidate': {
        const named = contest.candidates.slice(0, contest.seats);
        votes[contest.id] =
          includeWriteIns && contest.allowWriteIns
            ? [
                ...named.slice(0, Math.max(0, contest.seats - 1)),
                { id: 'write-in-0', name: 'MARY SMITH', isWriteIn: true },
              ]
            : named;
        break;
      }
      default:
        break;
    }
  }
  return votes;
}

test('bubble ballot metadata matches the recorded wire format', () => {
  expect(goldenPayloads.hmpb.length).toBeGreaterThan(0);

  for (const vector of goldenPayloads.hmpb) {
    const electionDefinition = ELECTIONS[vector.election]!;
    const { election } = electionDefinition;
    const ballotStyle = election.ballotStyles[vector.styleIndex]!;
    const metadata: HmpbBallotPageMetadata = {
      ballotHash: electionDefinition.ballotHash,
      ballotStyleId: ballotStyle.id,
      precinctId: ballotStyle.precincts[0]!,
      isTestMode: vector.isTestMode,
      ballotType: vector.ballotType as BallotType,
      pageNumber: 1,
      ballotAuditId: vector.ballotAuditId ?? undefined,
    };

    expect(
      Buffer.from(
        encodeHmpbBallotPageMetadata(
          election,
          metadata,
          vector.version as SoftwareVersion
        )
      ).toString('hex'),
      `${vector.election} style ${vector.styleIndex} ${vector.version}`
    ).toEqual(vector.bytes);
  }
});

test('summary ballot matches the recorded wire format', () => {
  expect(goldenPayloads.summary.length).toBeGreaterThan(0);

  for (const vector of goldenPayloads.summary) {
    const electionDefinition = ELECTIONS[vector.election]!;
    const { election } = electionDefinition;
    const ballotStyle = election.ballotStyles[vector.styleIndex]!;
    const contests = getContests({ ballotStyle, election });

    expect(
      Buffer.from(
        encodeSummaryBallotPage(election, {
          ballotHash: electionDefinition.ballotHash,
          ballotStyleId: ballotStyle.id,
          precinctId: ballotStyle.precincts[0]!,
          isTestMode: vector.isTestMode,
          ballotType: BallotType.Precinct,
          pageNumber: 1,
          totalPages: 1,
          ballotAuditId: 'audit-42',
          contests,
          votes: votesFor(contests, vector.includeWriteIns),
        })
      ).toString('hex'),
      `${vector.election} style ${vector.styleIndex}`
    ).toEqual(vector.bytes);
  }
});

describe.each(Object.entries(ELECTIONS))('%s', (_name, electionDefinition) => {
  const { election } = electionDefinition;

  test('summary ballots round-trip', () => {
    for (const ballotStyle of election.ballotStyles) {
      const contests = getContests({ ballotStyle, election });
      expect(contests.length).toBeGreaterThan(0);
      const votes = votesFor(contests, true);

      const encoded = encodeSummaryBallotPage(election, {
        ballotHash: electionDefinition.ballotHash,
        ballotStyleId: ballotStyle.id,
        precinctId: ballotStyle.precincts[0]!,
        isTestMode: false,
        ballotType: BallotType.Precinct,
        pageNumber: 1,
        totalPages: 1,
        ballotAuditId: 'audit-42',
        contests,
        votes,
      });

      const decoded = decodeSummaryBallotPage(electionDefinition, encoded);
      expect(decoded.metadata.ballotStyleId).toEqual(ballotStyle.id);
      expect(decoded.metadata.contestIds).toEqual(contests.map((c) => c.id));

      // Decoding reports every contest on the page, using an empty array for
      // the ones with no selections, so undervotes are distinguishable from
      // contests that are not on this page at all. Write-in IDs are rebuilt
      // from the name, since only the name is on the wire.
      const expected: VotesDict = {};
      for (const contest of contests) {
        const vote = votes[contest.id] ?? [];
        expected[contest.id] = vote.every((s) => typeof s === 'string')
          ? vote
          : vote.map((candidate) =>
              candidate.isWriteIn
                ? { ...candidate, id: `write-in-${candidate.name}` }
                : candidate
            );
      }
      expect(decoded.votes).toEqual(expected);
    }
  });
});

test('decodeBallotHash reads either payload kind, isVxBallot only summary', () => {
  const hashBytes = [
    0x2b, 0xad, 0x6b, 0xe9, 0x35, 0xdd, 0x46, 0xb1, 0x0c, 0x5f,
  ];
  const summary = Uint8Array.from([0x56, 0x53, 0x01, ...hashBytes, 0x00]);
  const bubble = Uint8Array.from([0x56, 0x42, 0x01, ...hashBytes, 0x00]);
  const garbage = Uint8Array.from([0x00, 0x01, 0x02, 0x03]);

  expect(decodeBallotHash(summary)).toEqual(
    sliceBallotHashForEncoding('2bad6be935dd46b10c5f')
  );
  expect(decodeBallotHash(bubble)).toEqual(
    sliceBallotHashForEncoding('2bad6be935dd46b10c5f')
  );
  expect(decodeBallotHash(garbage)).toBeUndefined();

  expect(isVxBallot(summary)).toEqual(true);
  expect(isVxBallot(bubble)).toEqual(false);
  expect(isVxBallot(garbage)).toEqual(false);
});

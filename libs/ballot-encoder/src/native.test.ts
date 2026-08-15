import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { Buffer } from 'node:buffer';
import {
  BallotType,
  Candidate,
  Contest,
  HmpbBallotPageMetadata,
  ElectionDefinition,
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
import { arbitraryBallotId } from '@votingworks/test-utils';
import {
  SummaryBallotPage,
  decodeBallotHash,
  decodeSummaryBallotPage,
  encodeHmpbBallotPageMetadata,
  encodeSummaryBallotPage,
  isVxBallot,
  sliceBallotHashForEncoding,
} from '.';
import * as native from './native';

/**
 * The Rust implementation is only allowed to replace the TypeScript one if it
 * produces the same bytes and reads them back the same way. These compare the
 * two directly rather than either against a fixture, so a divergence shows up
 * here rather than as a ballot that prints but won't scan.
 *
 * Real fixture elections rather than `arbitraryElectionDefinition`: that
 * generator picks ballot style districts independently of contest districts, so
 * `getContests` comes back empty and every contest-dependent property silently
 * skips its body.
 */

const ELECTIONS: Array<[string, ElectionDefinition]> = [
  ['general', readElectionGeneralDefinition()],
  ['famous names', electionFamousNames2021Fixtures.readElectionDefinition()],
  [
    'two-party primary',
    electionTwoPartyPrimaryFixtures.readElectionDefinition(),
  ],
  ['straight party', electionStraightPartyFixtures.readElectionDefinition()],
  [
    'combined ballot primary',
    electionCombinedBallotPrimaryFixtures.readElectionDefinition(),
  ],
];

const WRITE_IN_CANDIDATE: Candidate = {
  id: 'write-in-0',
  name: 'MARY SMITH',
  isWriteIn: true,
};

const BALLOT_TYPES = [
  BallotType.Precinct,
  BallotType.Absentee,
  BallotType.Provisional,
] as const;

/**
 * Fills in votes for a page's contests, leaving every fourth one blank so
 * undervotes are covered too.
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
                WRITE_IN_CANDIDATE,
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

describe.each(ELECTIONS)('%s', (_name, electionDefinition) => {
  const { election } = electionDefinition;
  const { ballotStyles } = election;

  test('bubble ballot metadata encodes identically', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: ballotStyles.length - 1 }),
        fc.boolean(),
        fc.constantFrom(...BALLOT_TYPES),
        fc.integer({ min: 1, max: 30 }),
        fc.option(arbitraryBallotId(), { nil: undefined }),
        fc.constantFrom('v4.0' as const, 'v4.1' as const),
        (
          styleIndex,
          isTestMode,
          ballotType,
          pageNumber,
          ballotAuditId,
          version
        ) => {
          const ballotStyle = ballotStyles[styleIndex]!;
          const metadata: HmpbBallotPageMetadata = {
            ballotHash: electionDefinition.ballotHash,
            ballotStyleId: ballotStyle.id,
            precinctId: ballotStyle.precincts[0]!,
            isTestMode,
            ballotType,
            pageNumber,
            ballotAuditId,
          };

          expect(
            Buffer.from(
              native.encodeHmpbBallotPageMetadata(election, metadata, version)
            ).toString('hex')
          ).toEqual(
            Buffer.from(
              encodeHmpbBallotPageMetadata(election, metadata, version)
            ).toString('hex')
          );
        }
      )
    );
  });

  test('summary ballot encodes identically', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: ballotStyles.length - 1 }),
        fc.boolean(),
        fc.constantFrom(...BALLOT_TYPES),
        arbitraryBallotId(),
        fc.boolean(),
        (
          styleIndex,
          isTestMode,
          ballotType,
          ballotAuditId,
          includeWriteIns
        ) => {
          const ballotStyle = ballotStyles[styleIndex]!;
          const contests = getContests({ ballotStyle, election });
          expect(contests.length).toBeGreaterThan(0);

          const page: SummaryBallotPage = {
            ballotHash: electionDefinition.ballotHash,
            ballotStyleId: ballotStyle.id,
            precinctId: ballotStyle.precincts[0]!,
            isTestMode,
            ballotType,
            pageNumber: 1,
            totalPages: 1,
            ballotAuditId,
            contests,
            votes: votesFor(contests, includeWriteIns),
          };

          expect(
            Buffer.from(
              native.encodeSummaryBallotPage(election, page)
            ).toString('hex')
          ).toEqual(
            Buffer.from(encodeSummaryBallotPage(election, page)).toString('hex')
          );
        }
      )
    );
  });

  test('summary ballot decodes identically', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: ballotStyles.length - 1 }),
        fc.boolean(),
        arbitraryBallotId(),
        fc.boolean(),
        (styleIndex, isTestMode, ballotAuditId, includeWriteIns) => {
          const ballotStyle = ballotStyles[styleIndex]!;
          const contests = getContests({ ballotStyle, election });
          expect(contests.length).toBeGreaterThan(0);

          const encoded = encodeSummaryBallotPage(election, {
            ballotHash: electionDefinition.ballotHash,
            ballotStyleId: ballotStyle.id,
            precinctId: ballotStyle.precincts[0]!,
            isTestMode,
            ballotType: BallotType.Precinct,
            pageNumber: 1,
            totalPages: 1,
            ballotAuditId,
            contests,
            votes: votesFor(contests, includeWriteIns),
          });

          expect(
            native.decodeSummaryBallotPage(electionDefinition, encoded)
          ).toEqual(decodeSummaryBallotPage(electionDefinition, encoded));
        }
      )
    );
  });
});

test('decodeBallotHash and isVxBallot agree with TypeScript', () => {
  const summary = Uint8Array.from([
    0x56, 0x53, 0x01, 0x2b, 0xad, 0x6b, 0xe9, 0x35, 0xdd, 0x46, 0xb1, 0x0c,
    0x5f, 0x00,
  ]);
  const bubble = Uint8Array.from([
    0x56, 0x42, 0x01, 0x2b, 0xad, 0x6b, 0xe9, 0x35, 0xdd, 0x46, 0xb1, 0x0c,
    0x5f, 0x00,
  ]);
  const garbage = Uint8Array.from([0x00, 0x01, 0x02, 0x03]);

  for (const data of [summary, bubble, garbage]) {
    expect(native.decodeBallotHash(data)).toEqual(decodeBallotHash(data));
    expect(native.isVxBallot(data)).toEqual(isVxBallot(data));
  }

  expect(native.decodeBallotHash(summary)).toEqual(
    sliceBallotHashForEncoding('2bad6be935dd46b10c5f')
  );
});

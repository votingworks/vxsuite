import { expect, test } from 'vitest';
import fc from 'fast-check';
import { Buffer } from 'node:buffer';
import { BallotType, Election } from '@votingworks/types';
import {
  encodeHmpbBallotPageMetadata,
  sliceBallotHashForEncoding,
} from '@votingworks/ballot-encoder';
import {
  arbitraryBallotId,
  arbitraryElectionDefinition,
} from '@votingworks/test-utils';
import { napi } from './bubble-ballot-ts/napi';

/**
 * Bubble ballot metadata is on every scanned ballot, and until now the Rust and
 * TypeScript implementations of its wire format had no equivalence test between
 * them — only summary ballots did (see `cross_language_bmd.test.ts`). These
 * check both directions: that Rust decodes what TypeScript writes, and that
 * Rust writes exactly the same bytes.
 */

const FC_PARAMS: fc.Parameters<unknown> = { numRuns: 100 };

const BALLOT_TYPES = [
  BallotType.Precinct,
  BallotType.Absentee,
  BallotType.Provisional,
] as const;

/**
 * Picks a ballot style and a precinct it applies to, or `undefined` if the
 * generated election has neither.
 */
function pickConfig(election: Election) {
  const ballotStyle = election.ballotStyles[0];
  if (!ballotStyle) return undefined;
  const precinct = election.precincts.find((p) =>
    ballotStyle.precincts.includes(p.id)
  );
  if (!precinct) return undefined;
  return { ballotStyle, precinct };
}

test('bubble ballot metadata: TS encode matches Rust decode', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryElectionDefinition(),
      fc.boolean(),
      fc.constantFrom(...BALLOT_TYPES),
      fc.integer({ min: 1, max: 30 }),
      fc.option(arbitraryBallotId(), { nil: undefined }),
      async (
        { election, ballotHash },
        isTestMode,
        ballotType,
        pageNumber,
        ballotAuditId
      ) => {
        const config = pickConfig(election);
        if (!config) return;
        const { ballotStyle, precinct } = config;

        const encoded = encodeHmpbBallotPageMetadata(
          election,
          {
            ballotHash,
            ballotStyleId: ballotStyle.id,
            precinctId: precinct.id,
            isTestMode,
            ballotType,
            pageNumber,
            ballotAuditId,
          },
          'v4.1'
        );

        const decoded = await napi.decodeBubbleBallotMetadata(
          election,
          Buffer.from(encoded),
          ballotHash
        );

        expect(decoded.ballotHash).toEqual(
          sliceBallotHashForEncoding(ballotHash)
        );
        expect(decoded.ballotStyleId).toEqual(ballotStyle.id);
        expect(decoded.precinctId).toEqual(precinct.id);
        expect(decoded.isTestMode).toEqual(isTestMode);
        expect(decoded.pageNumber).toEqual(pageNumber);
        expect(decoded.ballotType).toEqual(ballotType);
        expect(decoded.ballotAuditId).toEqual(ballotAuditId);
      }
    ),
    FC_PARAMS
  );
});

test('bubble ballot metadata: Rust encode is byte-identical to TS encode', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryElectionDefinition(),
      fc.boolean(),
      fc.constantFrom(...BALLOT_TYPES),
      fc.integer({ min: 1, max: 30 }),
      fc.option(arbitraryBallotId(), { nil: undefined }),
      fc.constantFrom('v4.0' as const, 'v4.1' as const),
      async (
        { election, ballotHash },
        isTestMode,
        ballotType,
        pageNumber,
        ballotAuditId,
        version
      ) => {
        const config = pickConfig(election);
        if (!config) return;
        const { ballotStyle, precinct } = config;

        const fromTypeScript = encodeHmpbBallotPageMetadata(
          election,
          {
            ballotHash,
            ballotStyleId: ballotStyle.id,
            precinctId: precinct.id,
            isTestMode,
            ballotType,
            pageNumber,
            ballotAuditId,
          },
          version
        );

        const fromRust = await napi.encodeBubbleBallotMetadata(
          election,
          {
            ballotHash: sliceBallotHashForEncoding(ballotHash),
            ballotStyleId: ballotStyle.id,
            precinctId: precinct.id,
            isTestMode,
            ballotType,
            pageNumber,
            ballotAuditId,
          },
          version
        );

        expect(Buffer.from(fromRust).toString('hex')).toEqual(
          Buffer.from(fromTypeScript).toString('hex')
        );
      }
    ),
    FC_PARAMS
  );
});

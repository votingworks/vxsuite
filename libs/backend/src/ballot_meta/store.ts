/* eslint-disable max-classes-per-file */
import {
  CandidateOrderingsSchema,
  unsafeParseJson,
  SheetPositionsSchema,
  type BallotCandidateOrderings,
  type BallotPositions,
  type CandidateOrderings,
  type Election,
  type SheetPositions,
  type SystemSettings,
  type BallotStyle,
  type BallotStyleGroupId,
} from '@votingworks/types';
import { iter } from '@votingworks/basics';
import type { Client } from '@votingworks/db';
import z from 'zod';
import {
  streamBallotPositions,
  streamCandidateOrderings,
  type ElectionPackageZip,
} from '../election_package/election_package_io.js';

/** Store interface for bubble ballot positions. */
export class BallotPositionsStore {
  private readonly client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Retrieves ballot positions from the store, or `null` if not found.
   */
  getPositions(styleId: string): SheetPositions[] | null {
    const row = this.client.one(
      `select positions from ballot_positions where style_id = ?`,
      styleId
    ) as { positions: string } | undefined;

    if (!row) return null;

    return unsafeParseJson(row.positions, z.array(SheetPositionsSchema));
  }

  /**
   * @returns `true` if bubble ballot positions exist for any ballot style.
   */
  hasPositions(): boolean {
    return Boolean(this.client.one(`select 1 from ballot_positions limit 1`));
  }

  /** Inserts ballot positions read by {@link readBallotPositions}. */
  addPositions(positions: readonly BallotPositions[]): void {
    for (const p of positions) addPositions(this.client, p);
  }
}

/** Store interface for candidate orderings. */
export class CandidateOrderingsStore {
  private readonly client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Retrieves candidate orderings, or `null` if not found.
   */
  getCandidateOrderings(
    ballotStyle: Pick<BallotStyle, 'groupId'>
  ): CandidateOrderings | null {
    const row = this.client.one(
      `select orderings from candidate_orderings where style_group_id = ?`,
      ballotStyle.groupId
    ) as { orderings: string } | undefined;

    if (!row) return null;

    return unsafeParseJson(row.orderings, CandidateOrderingsSchema);
  }

  /** Inserts candidate orderings read by {@link readCandidateOrderings}. */
  addCandidateOrderings(orderings: readonly BallotCandidateOrderings[]): void {
    for (const o of orderings) addCandidateOrderings(this.client, o);
  }
}

/** Reads the candidate orderings of every ballot style group in a package. */
export async function readCandidateOrderings(
  zip: ElectionPackageZip,
  election: Election,
  settings: SystemSettings
): Promise<BallotCandidateOrderings[]> {
  if (settings.splitElectionDefinition) {
    return await iter(streamCandidateOrderings(zip)).toArray();
  }

  const orderings: BallotCandidateOrderings[] = [];
  const seenGroupIds = new Set<BallotStyleGroupId>();
  for (const bs of election.ballotStyles) {
    if (seenGroupIds.has(bs.groupId)) continue;
    seenGroupIds.add(bs.groupId);

    if (!bs.orderedCandidatesByContest) continue;

    orderings.push({
      ballotStyleGroupId: bs.groupId,
      orderings: bs.orderedCandidatesByContest,
    });
  }
  return orderings;
}

/** Reads the bubble positions of every scannable ballot style in a package. */
export async function readBallotPositions(
  zip: ElectionPackageZip,
  election: Election,
  settings: SystemSettings
): Promise<BallotPositions[]> {
  if (settings.splitElectionDefinition) {
    return await iter(streamBallotPositions(zip)).toArray();
  }

  const positions: BallotPositions[] = [];
  for (const bs of election.ballotStyles) {
    if (!bs.ballotPositions) continue; // Not a scannable ballot.

    positions.push({
      ballotStyleId: bs.id,
      positions: bs.ballotPositions,
    });
  }
  return positions;
}

function addCandidateOrderings(c: Client, b: BallotCandidateOrderings): void {
  c.run(
    `insert into candidate_orderings (style_group_id, orderings) values (?, ?)`,
    b.ballotStyleGroupId,
    JSON.stringify(b.orderings)
  );
}

function addPositions(client: Client, b: BallotPositions): void {
  client.run(
    `insert into ballot_positions ( style_id, positions ) values (?, ?)`,
    b.ballotStyleId,
    JSON.stringify(b.positions)
  );
}

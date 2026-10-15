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
} from '@votingworks/types';
import type { Client } from '@votingworks/db';
import z from 'zod';
import {
  streamBallotPositions,
  streamCandidateOrderings,
  type ElectionPackageZip,
} from '../election_package/election_package_io.js';

/** Store interface for ballot metadata. */
export class BallotMetaStore {
  private readonly client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Retrieves candidate orderings, or `null` if not found.
   */
  getCandidateOrderings(styleId: string): CandidateOrderings | null {
    const row = this.client.one(
      `select orderings from candidate_orderings where style_id = ?`,
      styleId
    ) as { orderings: string } | undefined;

    if (!row) return null;

    return unsafeParseJson(row.orderings, CandidateOrderingsSchema);
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
   * @returns `true` if positions exist for any ballot style.
   */
  hasPositions(): boolean {
    return Boolean(this.client.one(`select 1 from ballot_positions limit 1`));
  }

  /**
   * Imports candidate orderings from an election package.
   */
  async importCandidateOrderings(
    zip: ElectionPackageZip,
    election: Election,
    settings: SystemSettings
  ): Promise<void> {
    if (!settings.splitElectionDefinition) {
      for (const bs of election.ballotStyles) {
        if (!bs.orderedCandidatesByContest) continue;

        addCandidateOrderings(this.client, {
          ballotStyleId: bs.id,
          orderings: bs.orderedCandidatesByContest,
        });
      }

      return;
    }

    for await (const co of streamCandidateOrderings(zip)) {
      addCandidateOrderings(this.client, co);
    }
  }

  /**
   * Imports ballot positions from an election package into the store.
   */
  async importPositions(
    zip: ElectionPackageZip,
    election: Election,
    settings: SystemSettings
  ): Promise<void> {
    if (!settings.splitElectionDefinition) {
      for (const bs of election.ballotStyles) {
        if (!bs.ballotPositions) continue; // Not a scannable ballot.

        addPositions(this.client, {
          ballotStyleId: bs.id,
          positions: bs.ballotPositions,
        });
      }

      return;
    }

    for await (const bp of streamBallotPositions(zip)) {
      addPositions(this.client, bp);
    }
  }
}

function addCandidateOrderings(c: Client, b: BallotCandidateOrderings): void {
  c.run(
    `insert into candidate_orderings ( style_id, orderings ) values (?, ?)`,
    b.ballotStyleId,
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

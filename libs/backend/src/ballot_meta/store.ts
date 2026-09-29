import {
  safeParseJson,
  SheetPositionsSchema,
  type BallotPositions,
  type Election,
  type SheetPositions,
  type SystemSettings,
} from '@votingworks/types';
import type { Client } from '@votingworks/db';
import z from 'zod';
import {
  streamBallotPositions,
  type ElectionPackageZip,
} from '../election_package/election_package_io.js';

/** Store interface for ballot metadata. */
export class BallotMetaStore {
  private readonly client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Retrieves ballot positions from the store, or `null` if not found.
   */
  getBallotPositions(styleId: string): SheetPositions[] | null {
    const row = this.client.one(
      `select positions from ballot_positions where style_id = ?`,
      styleId
    ) as { positions: string } | undefined;

    if (!row) return null;

    const parseRes = safeParseJson(
      row.positions,
      z.array(SheetPositionsSchema)
    );
    return parseRes.unsafeUnwrap();
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

function addPositions(client: Client, b: BallotPositions): void {
  client.run(
    `insert into ballot_positions ( style_id, positions ) values (?, ?)`,
    b.ballotStyleId,
    JSON.stringify(b.positions)
  );
}

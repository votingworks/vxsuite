import { assert, iter } from '@votingworks/basics';
import type { Client } from '@votingworks/db';
import type {
  BallotMode,
  BallotStyleId,
  BallotType,
  EncodedBallotEntry,
  PrecinctId,
} from '@votingworks/types';
import {
  streamElectionPackageBallots,
  type ElectionPackageZip,
} from './election_package_io.js';

const BALLOT_BATCH_SIZE = 100;

/** Identifies one pre-rendered ballot PDF. */
export interface EncodedBallotKey {
  readonly ballotStyleId: BallotStyleId;
  readonly precinctId: PrecinctId;
  readonly ballotType: BallotType;
  readonly ballotMode: BallotMode;
}

/** Narrows a ballot query; omitted fields match every ballot. */
export type EncodedBallotFilter = Partial<EncodedBallotKey>;

/** A stored ballot PDF and its row ID. */
export interface StoredEncodedBallot extends EncodedBallotEntry {
  readonly id: number;
}

const KEY_COLUMNS = {
  ballotStyleId: 'ballot_style_id',
  precinctId: 'precinct_id',
  ballotType: 'ballot_type',
  ballotMode: 'ballot_mode',
} as const satisfies Record<keyof EncodedBallotKey, string>;

const KEY_SELECT = `
  ballot_style_id as ballotStyleId,
  precinct_id as precinctId,
  ballot_type as ballotType,
  ballot_mode as ballotMode
`;

function whereClause(filter: EncodedBallotFilter): {
  sql: string;
  params: string[];
} {
  const conditions: string[] = [];
  const params: string[] = [];
  for (const [field, column] of Object.entries(KEY_COLUMNS)) {
    const value = filter[field as keyof EncodedBallotKey];
    if (value !== undefined) {
      conditions.push(`${column} = ?`);
      params.push(value);
    }
  }
  return {
    sql: conditions.length > 0 ? `where ${conditions.join(' and ')}` : '',
    params,
  };
}

/** Store interface for the pre-rendered ballot PDFs in an election package. */
export class EncodedBallotStore {
  private readonly client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  /** Imports every ballot PDF in the package, committing in batches. */
  async importBallots(zip: ElectionPackageZip): Promise<void> {
    assert(
      !this.client.isInTransaction(),
      'ballots must not be imported inside a transaction'
    );

    const batches = iter(streamElectionPackageBallots(zip)).chunks<number>(
      BALLOT_BATCH_SIZE
    );
    for await (const batch of batches) {
      this.insertBallots(batch);
    }
  }

  private insertBallots(ballots: readonly EncodedBallotEntry[]): void {
    this.client.transaction(() => {
      for (const ballot of ballots) {
        this.client.run(
          `
          insert into ballots (
            ballot_style_id,
            precinct_id,
            ballot_type,
            ballot_mode,
            encoded_ballot
          ) values (?, ?, ?, ?, ?)
          `,
          ballot.ballotStyleId,
          ballot.precinctId,
          ballot.ballotType,
          ballot.ballotMode,
          ballot.encodedBallot
        );
      }
    });
  }

  hasBallots(filter: EncodedBallotFilter = {}): boolean {
    const where = whereClause(filter);
    return (
      this.client.one(
        `select 1 from ballots ${where.sql} limit 1`,
        ...where.params
      ) !== undefined
    );
  }

  getBallot(key: EncodedBallotKey): EncodedBallotEntry | undefined {
    return this.client.one(
      `
      select ${KEY_SELECT}, encoded_ballot as encodedBallot
      from ballots
      where
        ballot_style_id = ? and
        precinct_id = ? and
        ballot_type = ? and
        ballot_mode = ?
      `,
      key.ballotStyleId,
      key.precinctId,
      key.ballotType,
      key.ballotMode
    ) as EncodedBallotEntry | undefined;
  }

  getBallots(filter: EncodedBallotFilter = {}): StoredEncodedBallot[] {
    const where = whereClause(filter);
    return this.client.all(
      `
      select id, ${KEY_SELECT}, encoded_ballot as encodedBallot
      from ballots ${where.sql}
      order by id
      `,
      ...where.params
    ) as StoredEncodedBallot[];
  }

  /** Lists the matching ballots without loading their PDFs. */
  getBallotKeys(filter: EncodedBallotFilter): EncodedBallotKey[] {
    const where = whereClause(filter);
    return this.client.all(
      `select ${KEY_SELECT} from ballots ${where.sql} order by id`,
      ...where.params
    ) as EncodedBallotKey[];
  }
}

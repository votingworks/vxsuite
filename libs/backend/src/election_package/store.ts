import { chmodSync, rmSync } from 'node:fs';
import { Client } from '@votingworks/db';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { assertDefined, DateWithoutTime } from '@votingworks/basics';
import {
  constructElectionKey,
  safeParseElection,
  safeParseSystemSettings,
  type ElectionDefinition,
  type ElectionKey,
  type SystemSettings,
} from '@votingworks/types';
import {
  BallotPositionsStore,
  CandidateOrderingsStore,
  readBallotPositions,
  readCandidateOrderings,
} from '../ballot_meta/store.js';
import { EncodedBallotStore } from './encoded_ballot_store.js';
import {
  createUiStringStore,
  type UiStringsStore,
} from '../ui_strings/ui_strings_store.js';
import {
  configureUiStrings,
  configureUiStringAudioClipsStreaming,
} from '../ui_strings/ui_strings_machine_configuration.js';
import {
  withElectionPackageZip,
  type ParsedElectionPackageWithFilePath,
} from './election_package_io.js';
import { ELECTION_PACKAGE_SCHEMA_PATH } from './schema.js';

/** An election definition and the election package hash. */
export interface ElectionRecord {
  electionDefinition: ElectionDefinition;
  electionPackageHash: string;
}

/** The election package to import, and the jurisdiction importing it. */
export interface ElectionPackageImport extends ParsedElectionPackageWithFilePath {
  jurisdiction: string;
  logger: BaseLogger;
}

/** Which optional parts of an election package an app imports. */
export interface ElectionPackageInclude {
  /** UI strings and audio clips. */
  readonly uiStrings: boolean;
  /** Pre-rendered ballot PDFs. */
  readonly ballots: boolean;
  /** Bubble ballot positions. */
  readonly ballotPositions: boolean;
  readonly candidateOrderings: boolean;
}

/** An {@link ElectionPackageInclude} that includes every part in `K`. */
export type ElectionPackageIncluding<K extends keyof ElectionPackageInclude> =
  ElectionPackageInclude & { readonly [P in K]: true };

/**
 * Holds everything imported from an election package, in a database of its
 * own that is written when a machine is configured and read-only after.
 * `include` fixes which optional parts are imported, and only their stores
 * can be retrieved.
 */
export class ElectionPackageStore<
  I extends ElectionPackageInclude = ElectionPackageInclude,
> {
  private cachedElectionRecord?: ElectionRecord | null;
  private cachedSystemSettings?: SystemSettings | null;

  private readonly client: Client;
  private readonly include: I;
  private readonly ballotPositionsStore: BallotPositionsStore;
  private readonly candidateOrderingsStore: CandidateOrderingsStore;
  private readonly encodedBallotStore: EncodedBallotStore;
  private readonly uiStringsStore: UiStringsStore;

  private constructor(client: Client, include: I) {
    this.client = client;
    this.include = include;
    this.ballotPositionsStore = new BallotPositionsStore(client);
    this.candidateOrderingsStore = new CandidateOrderingsStore(client);
    this.encodedBallotStore = new EncodedBallotStore(client);
    this.uiStringsStore = createUiStringStore(client);
  }

  /** Builds a store whose data is kept in memory. */
  static memoryStore<const I extends ElectionPackageInclude>(
    include: I
  ): ElectionPackageStore<I> {
    return new ElectionPackageStore(
      Client.memoryClient(ELECTION_PACKAGE_SCHEMA_PATH),
      include
    );
  }

  /** Builds a store at `dbPath`. */
  static fileStore<const I extends ElectionPackageInclude>(
    dbPath: string,
    include: I,
    logger: BaseLogger = new BaseLogger(LogSource.System)
  ): ElectionPackageStore<I> {
    return new ElectionPackageStore(
      Client.fileClient(dbPath, logger, ELECTION_PACKAGE_SCHEMA_PATH, {
        queryOnly: true,
      }),
      include
    );
  }

  getDbPath(): string {
    return this.client.getDatabasePath();
  }

  /** Empties the store. */
  reset(): void {
    this.cachedElectionRecord = undefined;
    this.cachedSystemSettings = undefined;
    this.client.reset();
  }

  close(): void {
    this.cachedElectionRecord = undefined;
    this.cachedSystemSettings = undefined;
    this.client.close();
  }

  getBallotPositionsStore(
    this: ElectionPackageStore<ElectionPackageIncluding<'ballotPositions'>>
  ): BallotPositionsStore {
    return this.ballotPositionsStore;
  }

  getCandidateOrderingsStore(
    this: ElectionPackageStore<ElectionPackageIncluding<'candidateOrderings'>>
  ): CandidateOrderingsStore {
    return this.candidateOrderingsStore;
  }

  getEncodedBallotStore(
    this: ElectionPackageStore<ElectionPackageIncluding<'ballots'>>
  ): EncodedBallotStore {
    return this.encodedBallotStore;
  }

  getUiStringsStore(
    this: ElectionPackageStore<ElectionPackageIncluding<'uiStrings'>>
  ): UiStringsStore {
    return this.uiStringsStore;
  }

  hasElection(): boolean {
    return this.getElectionRecord() !== undefined;
  }

  getElectionRecord(): ElectionRecord | undefined {
    if (this.cachedElectionRecord === undefined) {
      const row = this.client.one(
        `
        select
          ballot_hash as ballotHash,
          election_data as electionData,
          election_package_hash as electionPackageHash
        from election
        `
      ) as
        | {
            ballotHash: string;
            electionData: string;
            electionPackageHash: string;
          }
        | undefined;

      this.cachedElectionRecord = row
        ? {
            electionDefinition: {
              ballotHash: row.ballotHash,
              election: safeParseElection(row.electionData).unsafeUnwrap(),
              electionData: row.electionData,
            },
            electionPackageHash: row.electionPackageHash,
          }
        : null;
    }

    return this.cachedElectionRecord ?? undefined;
  }

  /**
   * Retrieves the election key used for auth without parsing the whole
   * election, which matters during auth polling.
   */
  getElectionKey(): ElectionKey | undefined {
    const result = this.client.one(
      `
      select
        election_data ->> 'id' as id,
        election_data ->> 'date' as date
      from election
      `
    ) as { id?: string; date?: string } | undefined;

    if (!result) return undefined;

    // A CDF election has neither field at the top level, so parse it instead.
    if (!(result.id && result.date)) {
      return constructElectionKey(
        assertDefined(this.getElectionRecord()).electionDefinition.election
      );
    }

    return { id: result.id, date: new DateWithoutTime(result.date) };
  }

  getJurisdiction(): string | undefined {
    const row = this.client.one('select jurisdiction from election') as
      | { jurisdiction: string }
      | undefined;
    return row?.jurisdiction;
  }

  getSystemSettings(): SystemSettings | undefined {
    if (this.cachedSystemSettings === undefined) {
      const result = this.client.one('select data from system_settings') as
        | { data: string }
        | undefined;

      this.cachedSystemSettings = result
        ? safeParseSystemSettings(result.data).unsafeUnwrap()
        : null;
    }

    return this.cachedSystemSettings ?? undefined;
  }

  /**
   * Imports a whole election package, replacing whatever was imported before.
   * A file store builds the new database beside the live one, makes it
   * read-only, and swaps it in with one rename, so the live file is never
   * written in place and a failed import leaves it untouched.
   */
  async importElectionPackage(input: ElectionPackageImport): Promise<void> {
    if (this.client.isMemoryDatabase()) {
      this.client.reset();
      await importInto(this.client, input, this.include);
    } else {
      const tempDbPath = `${this.getDbPath()}.importing`;
      rmSync(tempDbPath, { force: true });
      const tempClient = Client.fileClient(
        tempDbPath,
        input.logger,
        ELECTION_PACKAGE_SCHEMA_PATH
      );
      try {
        await importInto(tempClient, input, this.include);
      } catch (error) {
        tempClient.close();
        rmSync(tempDbPath, { force: true });
        throw error;
      }
      tempClient.run('pragma journal_mode = delete');
      tempClient.close();
      chmodSync(tempDbPath, 0o444);
      this.client.replaceDatabaseFile(tempDbPath);
    }
    this.cachedElectionRecord = undefined;
    this.cachedSystemSettings = undefined;
  }
}

async function importInto(
  client: Client,
  {
    electionPackage,
    electionPackageHash,
    filePath,
    jurisdiction,
    logger,
  }: ElectionPackageImport,
  include: ElectionPackageInclude
): Promise<void> {
  const { electionDefinition, systemSettings } = electionPackage;
  const { election } = electionDefinition;
  const ballotPositionsStore = new BallotPositionsStore(client);
  const candidateOrderingsStore = new CandidateOrderingsStore(client);
  const encodedBallotStore = new EncodedBallotStore(client);
  const uiStringsStore = createUiStringStore(client);

  await withElectionPackageZip(filePath, async (zip) => {
    const positions = include.ballotPositions
      ? await readBallotPositions(zip, election, systemSettings)
      : [];
    const candidateOrderings = include.candidateOrderings
      ? await readCandidateOrderings(zip, election, systemSettings)
      : [];

    client.transaction(() => {
      client.run('delete from election');
      client.run(
        `
        insert into election (
          election_data,
          jurisdiction,
          ballot_hash,
          election_package_hash
        ) values (?, ?, ?, ?)
        `,
        electionDefinition.electionData,
        jurisdiction,
        electionDefinition.ballotHash,
        electionPackageHash
      );
      client.run('delete from system_settings');
      client.run(
        'insert into system_settings (data) values (?)',
        JSON.stringify(systemSettings)
      );
      ballotPositionsStore.addPositions(positions);
      candidateOrderingsStore.addCandidateOrderings(candidateOrderings);

      if (include.uiStrings) {
        configureUiStrings({ electionPackage, logger, store: uiStringsStore });
      }
    });

    if (include.ballots) {
      await encodedBallotStore.importBallots(zip);
    }
    if (include.uiStrings) {
      await configureUiStringAudioClipsStreaming({
        zip,
        store: uiStringsStore,
      });
    }
  });
}

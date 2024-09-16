import { Buffer } from 'node:buffer';
import { createReadStream } from 'node:fs';
import { Hasher, sha256 } from 'js-sha256';
import path from 'node:path';
import { Readable } from 'node:stream';
import { assert, groupBy } from '@votingworks/basics';
import { Client } from '@votingworks/db';
import { CastVoteRecordExportFileName } from '@votingworks/types';
import { getExportedCastVoteRecordIds } from '@votingworks/utils';

/**
 * A representation of a file that only provides its hash
 */
export interface HashableFile {
  computeSha256Hash(): Promise<string>;
  fileName: string;
}

/**
 * A representation of a file that can be read and hashed
 */
export interface ReadableFile extends HashableFile {
  open(): NodeJS.ReadableStream;
}

/**
 * Prepares a {@link HashableFile} from inline data
 */
export function hashableFileFromData(
  fileName: string,
  fileContents: string | Buffer
): HashableFile {
  return {
    computeSha256Hash: () => Promise.resolve(sha256(fileContents)),
    fileName,
  };
}

/**
 * Prepares a {@link ReadableFile} from inline data
 */
export function readableFileFromData(
  fileName: string,
  fileContents: string | Buffer
): ReadableFile {
  return {
    ...hashableFileFromData(fileName, fileContents),
    open: () => Readable.from(fileContents),
  };
}

/**
 * Prepares a {@link HashableFile} from a file on disk
 */
export function hashableFileFromDisk(filePath: string): HashableFile {
  return {
    computeSha256Hash: async () => {
      const reader = createReadStream(filePath);
      const hash = sha256.create();
      for await (const chunk of reader) {
        hash.update(chunk);
      }
      return hash.hex();
    },
    fileName: path.basename(filePath),
  };
}

/**
 * Prepares a {@link ReadableFile} from a file on disk
 */
export function readableFileFromDisk(filePath: string): ReadableFile {
  return {
    ...hashableFileFromDisk(filePath),
    open: () => createReadStream(filePath),
  };
}

/**
 * Computes a hash for a single cast vote record, incorporating the cast vote record's directory
 * name, report file name, and report contents. The summary that we hash specifically mirrors
 * the output of:
 * ```
 * sha256sum <cvrDirectoryName>/<CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT>
 * ```
 */
export async function computeSingleCastVoteRecordHash(
  cvrDirectoryName: string,
  cvrReportFile: HashableFile
): Promise<string> {
  // Ensure that a directory path wasn't accidentally provided instead of a directory name
  assert(!cvrDirectoryName.includes('/'));

  const cvrReportPathRelativeToExportRoot = path.join(
    cvrDirectoryName,
    CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT
  );
  const cvrDirectorySummary = `${await cvrReportFile.computeSha256Hash()}  ${cvrReportPathRelativeToExportRoot}\n`;
  return sha256(cvrDirectorySummary);
}

/**
 * A hash that can be combined with other hashes using {@link computeCombinedHash}.
 */
export interface CombinableHash {
  hash: string;
  sortKey: string;
}

/**
 * Sorts the provided hashes using the specified sort key, concatenates the hashes, and hashes the
 * result, yielding a combined hash
 */
export function computeCombinedHash(
  hashesToCombine: Iterable<CombinableHash>
): string {
  const hasher = sha256.create();

  for (const { hash } of [...hashesToCombine].sort((entry1, entry2) =>
    entry1.sortKey.localeCompare(entry2.sortKey)
  )) {
    hasher.update(hash);
  }

  return hasher.hex();
}

//
// Functions for managing cast vote record hashes in a SQLite DB table. This code is relevant for
// export-time hash computation.
//

/**
 * A schema for a Merkle tree (https://en.wikipedia.org/wiki/Merkle_tree) that allows for efficient
 * hashing of continuously exported cast vote records
 */
export const CAST_VOTE_RECORD_HASHES_TABLE_SCHEMA = `
create table cvr_hashes (
  cvr_id_level_1_prefix text not null check (
    length(cvr_id_level_1_prefix) = 1 or
    length(cvr_id_level_1_prefix) = 0
  ),
  cvr_id_level_2_prefix text not null check (
    length(cvr_id_level_2_prefix) = 2 or
    length(cvr_id_level_2_prefix) = 0
  ),
  cvr_id text not null check (
    length(cvr_id) = 36 or
    length(cvr_id) = 0
  ),
  cvr_hash text not null check (
    length(cvr_hash) = 64
  )
);

create unique index idx_cvr_hashes on cvr_hashes (
  cvr_id_level_1_prefix,
  cvr_id_level_2_prefix,
  cvr_id
);
`;

/**
 * Using true SQLite NULL values interferes with uniqueness constraints since SQLite treats all
 * NULL values as different, so we use an empty string instead.
 */
const NULL_VALUE = '';

interface Constraint {
  type: '=' | '!=';
  value: string;
}

function selectCastVoteRecordHashes(
  client: Client,
  hasher: Hasher,
  {
    cvrIdLevel1PrefixConstraint,
    cvrIdLevel2PrefixConstraint,
    cvrIdConstraint,
    orderBy,
  }: {
    cvrIdLevel1PrefixConstraint: Constraint;
    cvrIdLevel2PrefixConstraint: Constraint;
    cvrIdConstraint: Constraint;
    orderBy: 'cvr_id_level_1_prefix' | 'cvr_id_level_2_prefix' | 'cvr_id';
  }
): void {
  // Be extra cautious and run-time validate incoming params so that we don't solely rely on
  // compile-time validation to prevent SQL injection
  for (const constraint of [
    cvrIdLevel1PrefixConstraint,
    cvrIdLevel2PrefixConstraint,
    cvrIdConstraint,
  ]) {
    assert(['=', '!='].includes(constraint.type));
  }
  assert(
    ['cvr_id_level_1_prefix', 'cvr_id_level_2_prefix', 'cvr_id'].includes(
      orderBy
    )
  );

  for (const row of client.each(
    `
    select cvr_hash as cvrHash
    from cvr_hashes
    where
      cvr_id_level_1_prefix ${cvrIdLevel1PrefixConstraint.type} ? and
      cvr_id_level_2_prefix ${cvrIdLevel2PrefixConstraint.type} ? and
      cvr_id ${cvrIdConstraint.type} ?
    order by ${orderBy} asc
    `,
    cvrIdLevel1PrefixConstraint.value,
    cvrIdLevel2PrefixConstraint.value,
    cvrIdConstraint.value
  )) {
    const { cvrHash } = row as { cvrHash: string };
    hasher.update(cvrHash);
  }
}

function insertCastVoteRecordHash(
  client: Client,
  {
    cvrIdLevel1Prefix,
    cvrIdLevel2Prefix,
    cvrId,
    cvrHash,
  }: {
    cvrIdLevel1Prefix: string;
    cvrIdLevel2Prefix: string;
    cvrId: string;
    cvrHash: string;
  }
): void {
  client.run(
    `
    insert or replace into cvr_hashes (
      cvr_id_level_1_prefix,
      cvr_id_level_2_prefix,
      cvr_id,
      cvr_hash
    ) values (?, ?, ?, ?)
    `,
    cvrIdLevel1Prefix,
    cvrIdLevel2Prefix,
    cvrId,
    cvrHash
  );
}

/**
 * Gets the cast vote record root hash.
 *
 * See {@link CAST_VOTE_RECORD_HASHES_TABLE_SCHEMA} for more context.
 */
export function getCastVoteRecordRootHash(client: Client): string {
  const row = client.one(
    `
    select cvr_hash as cvrHash
    from cvr_hashes
    where
      cvr_id_level_1_prefix = '${NULL_VALUE}' and
      cvr_id_level_2_prefix = '${NULL_VALUE}' and
      cvr_id = '${NULL_VALUE}'
    `
  ) as { cvrHash: string } | undefined;
  return row?.cvrHash ?? '';
}

/**
 * Inserts a cast vote record hash (a leaf node in the Merkle tree) and updates the cast vote
 * record root hash (the root node in the Merkle tree), updating relevant intermediate hashes along
 * the way (intermediate nodes in the Merkle tree).
 *
 * See {@link CAST_VOTE_RECORD_HASHES_TABLE_SCHEMA} for more context.
 */
export function updateCastVoteRecordHashes(
  client: Client,
  cvrId: string,
  cvrHash: string
): void {
  const cvrIdLevel1Prefix = cvrId.slice(0, 1);
  const cvrIdLevel2Prefix = cvrId.slice(0, 2);

  client.transaction(() => {
    insertCastVoteRecordHash(client, {
      cvrIdLevel1Prefix,
      cvrIdLevel2Prefix,
      cvrId,
      cvrHash,
    });

    const level2Hasher = sha256.create();
    selectCastVoteRecordHashes(client, level2Hasher, {
      cvrIdLevel1PrefixConstraint: { type: '=', value: cvrIdLevel1Prefix },
      cvrIdLevel2PrefixConstraint: { type: '=', value: cvrIdLevel2Prefix },
      cvrIdConstraint: { type: '!=', value: NULL_VALUE },
      orderBy: 'cvr_id',
    });
    const level2Hash = level2Hasher.hex();
    insertCastVoteRecordHash(client, {
      cvrIdLevel1Prefix,
      cvrIdLevel2Prefix,
      cvrId: NULL_VALUE,
      cvrHash: level2Hash,
    });

    const level1Hasher = sha256.create();
    selectCastVoteRecordHashes(client, level1Hasher, {
      cvrIdLevel1PrefixConstraint: { type: '=', value: cvrIdLevel1Prefix },
      cvrIdLevel2PrefixConstraint: { type: '!=', value: NULL_VALUE },
      cvrIdConstraint: { type: '=', value: NULL_VALUE },
      orderBy: 'cvr_id_level_2_prefix',
    });
    const level1Hash = level1Hasher.hex();
    insertCastVoteRecordHash(client, {
      cvrIdLevel1Prefix,
      cvrIdLevel2Prefix: NULL_VALUE,
      cvrId: NULL_VALUE,
      cvrHash: level1Hash,
    });

    const rootHasher = sha256.create();
    selectCastVoteRecordHashes(client, rootHasher, {
      cvrIdLevel1PrefixConstraint: { type: '!=', value: NULL_VALUE },
      cvrIdLevel2PrefixConstraint: { type: '=', value: NULL_VALUE },
      cvrIdConstraint: { type: '=', value: NULL_VALUE },
      orderBy: 'cvr_id_level_1_prefix',
    });
    const rootHash = rootHasher.hex();
    insertCastVoteRecordHash(client, {
      cvrId: NULL_VALUE,
      cvrIdLevel1Prefix: NULL_VALUE,
      cvrIdLevel2Prefix: NULL_VALUE,
      cvrHash: rootHash,
    });
  });
}

/**
 * Clears all cast vote record hashes
 */
export function clearCastVoteRecordHashes(client: Client): void {
  client.run('delete from cvr_hashes');
}

//
// Functions for computing cast vote record hashes from scratch. This code is relevant for
// import-time hash computation.
//

/**
 * Computes the cast vote record root hash from scratch given the export directory path, reading in
 * all files and computing hashes in memory without the aid of a SQLite DB
 */
export async function computeCastVoteRecordRootHashFromScratch(
  exportDirectoryPath: string
): Promise<string> {
  const cvrIds = await getExportedCastVoteRecordIds(exportDirectoryPath);
  if (cvrIds.length === 0) {
    return '';
  }

  const cvrHashes: CombinableHash[] = [];
  for (const cvrId of cvrIds) {
    const cvrReportFile = hashableFileFromDisk(
      path.join(
        exportDirectoryPath,
        cvrId,
        CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT
      )
    );
    const cvrHash = await computeSingleCastVoteRecordHash(cvrId, cvrReportFile);
    cvrHashes.push({ hash: cvrHash, sortKey: cvrId });
  }

  const level2Hashes: CombinableHash[] = groupBy(
    cvrHashes,
    ({ sortKey: cvrId }) => cvrId.slice(0, 2)
  ).map(([cvrIdLevel2Prefix, cvrHashesForLevel2Prefix]) => ({
    hash: computeCombinedHash(cvrHashesForLevel2Prefix),
    sortKey: cvrIdLevel2Prefix,
  }));

  const level1Hashes: CombinableHash[] = groupBy(
    level2Hashes,
    ({ sortKey: cvrIdLevel2Prefix }) => cvrIdLevel2Prefix.slice(0, 1)
  ).map(([cvrIdLevel1Prefix, level2HashesForLevel1Prefix]) => ({
    hash: computeCombinedHash(level2HashesForLevel1Prefix),
    sortKey: cvrIdLevel1Prefix,
  }));

  const rootHash = computeCombinedHash(level1Hashes);
  return rootHash;
}

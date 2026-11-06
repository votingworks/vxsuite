import { afterEach, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { SqliteError } from 'better-sqlite3';
import * as fs from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { err, iter, ok, range, typedAs } from '@votingworks/basics';
import {
  makeTemporaryDirectory,
  makeTemporaryFile,
} from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import {
  type BackupError,
  Client,
  type DbConnectionOptions,
  type Statement,
} from './client.js';
import { SchemaDigestMismatchError } from './schema_digest_mismatch_error.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

test('file database client', async () => {
  const dbFile = makeTemporaryFile();
  const client = Client.fileClient(dbFile, mockBaseLogger({ fn: vi.fn }));

  fs.accessSync(dbFile);

  expect(client.getDatabasePath()).toEqual(dbFile);
  expect(client.isMemoryDatabase()).toEqual(false);

  client.exec(
    'create table if not exists muppets (name varchar(255) unique not null)'
  );
  client.run('insert into muppets (name) values (?)', 'Kermit');
  client.run('insert into muppets (name) values (?)', 'Fozzie');

  const backupDbFile = makeTemporaryFile();
  expect(await client.backup(backupDbFile)).toEqual(ok());

  const clientForBackup = Client.fileClient(
    backupDbFile,
    mockBaseLogger({ fn: vi.fn })
  );
  expect(clientForBackup.all('select * from muppets')).toEqual([
    { name: 'Kermit' },
    { name: 'Fozzie' },
  ]);

  expect([...clientForBackup.each('select * from muppets')]).toEqual([
    { name: 'Kermit' },
    { name: 'Fozzie' },
  ]);
});

test('backs up a database whose connection is not yet established', async () => {
  const dbFile = makeTemporaryFile();
  const seedClient = Client.fileClient(dbFile, mockBaseLogger({ fn: vi.fn }));
  seedClient.exec(
    'create table if not exists muppets (name varchar(255) unique not null)'
  );
  seedClient.run('insert into muppets (name) values (?)', 'Gonzo');

  // A client with no schema connects lazily, so `backup` is the first thing
  // here to touch the database.
  const client = Client.fileClient(dbFile, mockBaseLogger({ fn: vi.fn }));
  const backupDbFile = makeTemporaryFile();
  expect(await client.backup(backupDbFile)).toEqual(ok());

  const clientForBackup = Client.fileClient(
    backupDbFile,
    mockBaseLogger({ fn: vi.fn })
  );
  expect(clientForBackup.all('select * from muppets')).toEqual([
    { name: 'Gonzo' },
  ]);
});

test('backs up a memory database', async () => {
  const client = Client.memoryClient();
  client.exec(
    'create table if not exists muppets (name varchar(255) unique not null)'
  );
  client.run('insert into muppets (name) values (?)', 'Rizzo');

  const backupDbFile = makeTemporaryFile();
  expect(await client.backup(backupDbFile)).toEqual(ok());

  const clientForBackup = Client.fileClient(
    backupDbFile,
    mockBaseLogger({ fn: vi.fn })
  );
  expect(clientForBackup.all('select * from muppets')).toEqual([
    { name: 'Rizzo' },
  ]);
});

test('file database client with a schema', () => {
  const dbFile = makeTemporaryFile();
  const schemaFile = join(import.meta.dirname, '../test/fixtures/schema.sql');
  const client = Client.fileClient(
    dbFile,
    mockBaseLogger({ fn: vi.fn }),
    schemaFile
  );

  fs.accessSync(dbFile);
  expect(client.getDatabasePath()).toEqual(dbFile);
  expect(client.isMemoryDatabase()).toEqual(false);

  expect(client.one('select count(*) as count from users')).toEqual({
    count: 0,
  });
  client.run(
    `
    insert into users (
      id,
      name,
      email,
      password_hash
    ) values (
      ?, ?, ?, ?
    )
  `,
    'kermie',
    'Kermit',
    'kermit@muppets.org',
    'hash'
  );

  expect(client.all('select * from users')).toEqual([
    {
      id: 'kermie',
      name: 'Kermit',
      email: 'kermit@muppets.org',
      password_hash: 'hash',
      created_at: expect.any(String),
      updated_at: expect.any(String),
    },
  ]);

  const anotherClient = Client.fileClient(
    dbFile,
    mockBaseLogger({ fn: vi.fn }),
    schemaFile
  );
  expect(anotherClient.one('select count(*) as count from users')).toEqual({
    count: 1,
  });
});

test('file database client with regex enabled in connectionOptions', () => {
  const dbFile = makeTemporaryFile();
  const connectionOptions: DbConnectionOptions = { registerRegexpFn: true };
  const client = Client.fileClient(
    dbFile,
    mockBaseLogger({ fn: vi.fn }),
    undefined,
    connectionOptions
  );

  client.create();
  fs.accessSync(dbFile);

  expect(client.getDatabasePath()).toEqual(dbFile);
  expect(client.isMemoryDatabase()).toEqual(false);

  client.exec(
    'create table if not exists muppets (name varchar(255) unique not null)'
  );
  client.run('insert into muppets (name) values (?)', 'Kermit');
  client.run('insert into muppets (name) values (?)', 'Fozzie');

  const queryString = 'select * from muppets where name REGEXP ?';

  // Test valid match
  expect(client.all(queryString, '.*ermi.*')).toEqual([{ name: 'Kermit' }]);

  // Test no match, but valid regexp
  expect(client.all(queryString, '.*mspiggy.*')).toEqual([]);

  // Test invalid regexp
  expect(client.all(queryString, '[')).toEqual([]);

  // Test client throws if it doesn't have regexp function registered
  const anotherClient = Client.fileClient(
    dbFile,
    mockBaseLogger({ fn: vi.fn })
  );
  expect(() => anotherClient.all(queryString, '.*ermi.*')).toThrow(
    new SqliteError('no such function: REGEXP', 'SQLITE_ERROR')
  );
});

test('queryOnly rejects writes but still creates the schema', () => {
  const dbFile = makeTemporaryFile();
  const schemaFile = makeTemporaryFile({
    content: 'create table muppets (name text not null);',
  });
  fs.rmSync(dbFile);
  const client = Client.fileClient(
    dbFile,
    mockBaseLogger({ fn: vi.fn }),
    schemaFile,
    { queryOnly: true }
  );

  expect(client.all('select * from muppets')).toEqual([]);
  expect(() =>
    client.run('insert into muppets (name) values (?)', 'Kermit')
  ).toThrow(/readonly/);

  client.reset();
  expect(() =>
    client.run('insert into muppets (name) values (?)', 'Kermit')
  ).toThrow(/readonly/);
});

test('closing a client is terminal', () => {
  const dbFile = makeTemporaryFile();
  const client = Client.fileClient(dbFile, mockBaseLogger({ fn: vi.fn }));

  client.exec('create table muppets (name varchar(255) not null)');
  client.close();

  // Closing again is harmless, but the client must not silently reconnect.
  client.close();
  expect(() => client.all('select * from muppets')).toThrow(
    `database client for ${dbFile} is closed`
  );
  expect(() => client.connect()).toThrow(
    `database client for ${dbFile} is closed`
  );
});

test('closing a client that never connected', () => {
  const dbFile = makeTemporaryFile();
  const client = Client.fileClient(dbFile, mockBaseLogger({ fn: vi.fn }));

  client.close();

  expect(() => client.connect()).toThrow(
    `database client for ${dbFile} is closed`
  );
});

test('`using` closes the client at the end of the scope', () => {
  const dbFile = makeTemporaryFile();
  let clientRef: Client;

  {
    using client = Client.fileClient(dbFile, mockBaseLogger({ fn: vi.fn }));
    client.exec('create table muppets (name varchar(255) not null)');
    expect(client.all('select * from muppets')).toEqual([]);
    clientRef = client;
  }

  expect(() => clientRef.all('select * from muppets')).toThrow(
    `database client for ${dbFile} is closed`
  );
});

test('reset file database client', () => {
  const dbFile = makeTemporaryFile();
  const schemaFile = join(import.meta.dirname, '../test/fixtures/schema.sql');
  const client = Client.fileClient(
    dbFile,
    mockBaseLogger({ fn: vi.fn }),
    schemaFile
  );

  // add data
  client.run(`
    INSERT INTO users (id, name, email, password_hash) VALUES 
      ('user1', 'Alice', 'alice@example.com', 'hash1'),
      ('user2', 'Bob', 'bob@example.com', 'hash2'),
      ('user3', 'Charlie', 'charlie@example.com', 'hash3')
  `);
  expect(
    (client.one('SELECT COUNT(*) as count FROM users') as { count: number })
      .count
  ).toEqual(3);

  // reset
  client.reset();

  // check data removed
  expect(
    (client.one('SELECT COUNT(*) as count FROM users') as { count: number })
      .count
  ).toEqual(0);
});

test('an iteration spanning a reset finishes on the old database', () => {
  const client = Client.fileClient(
    makeTemporaryFile(),
    mockBaseLogger({ fn: vi.fn }),
    join(import.meta.dirname, '../test/fixtures/schema.sql')
  );
  client.run(`
    INSERT INTO users (id, name, email, password_hash) VALUES
      ('user1', 'Alice', 'alice@example.com', 'hash1')
  `);

  const iterator = client.each('SELECT id FROM users');
  expect(iterator.next().value).toEqual({ id: 'user1' });
  client.reset();
  expect(iterator.next().done).toEqual(true);

  expect([...client.each('SELECT id FROM users')]).toEqual([]);
});

test('reset file database client that has not connected yet', () => {
  const dbFile = makeTemporaryFile();
  const client = Client.fileClient(dbFile, mockBaseLogger({ fn: vi.fn }));

  client.reset();

  client.exec('create table muppets (name varchar(255) not null)');
  client.run('insert into muppets (name) values (?)', 'Kermit');
  expect(client.all('select * from muppets')).toEqual([{ name: 'Kermit' }]);
});

test('replaceDatabaseFile swaps in another database file', () => {
  const schemaFile = join(import.meta.dirname, '../test/fixtures/schema.sql');
  const logger = mockBaseLogger({ fn: vi.fn });
  const client = Client.fileClient(makeTemporaryFile(), logger, schemaFile);
  client.run(
    "insert into users (id, name, email, password_hash) values ('u1', 'Alice', 'alice@example.com', 'h')"
  );

  const sourcePath = makeTemporaryFile();
  const source = Client.fileClient(sourcePath, logger, schemaFile);
  source.run(
    "insert into users (id, name, email, password_hash) values ('u2', 'Bob', 'bob@example.com', 'h')"
  );
  source.close();

  client.replaceDatabaseFile(sourcePath);
  expect(client.all('select name from users')).toEqual([{ name: 'Bob' }]);
  expect(fs.existsSync(sourcePath)).toEqual(false);

  expect(() =>
    Client.memoryClient(schemaFile).replaceDatabaseFile(sourcePath)
  ).toThrow('cannot replace the file of an in-memory database');
});

test('memory database client, reset', () => {
  const schemaFile = join(import.meta.dirname, '../test/fixtures/schema.sql');
  const client = Client.memoryClient(schemaFile);

  expect(client.getDatabasePath()).toEqual(':memory:');
  expect(client.isMemoryDatabase()).toEqual(true);

  // add data
  client.run(`
    INSERT INTO users (id, name, email, password_hash) VALUES 
      ('user1', 'Alice', 'alice@example.com', 'hash1'),
      ('user2', 'Bob', 'bob@example.com', 'hash2'),
      ('user3', 'Charlie', 'charlie@example.com', 'hash3')
  `);
  expect(
    (client.one('SELECT COUNT(*) as count FROM users') as { count: number })
      .count
  ).toEqual(3);

  // reset
  client.reset();

  // check data removed
  expect(
    (client.one('SELECT COUNT(*) as count FROM users') as { count: number })
      .count
  ).toEqual(0);
});

test('read/write', () => {
  const client = Client.memoryClient();

  client.exec(
    'create table if not exists muppets (name varchar(255) unique not null)'
  );
  expect(client.all('select * from muppets')).toEqual([]);
  expect(client.one('select * from muppets')).toBeUndefined();

  client.run('insert into muppets (name) values (?)', 'Kermit');
  client.run('insert into muppets (name) values (?)', 'Fozzie');

  expect(client.all('select * from muppets')).toEqual([
    { name: 'Kermit' },
    { name: 'Fozzie' },
  ]);
  expect([...client.each('select * from muppets')]).toEqual([
    { name: 'Kermit' },
    { name: 'Fozzie' },
  ]);
  expect(client.one('select * from muppets')).toEqual({ name: 'Kermit' });
  expect(client.one('select * from muppets where name != ?', 'Kermit')).toEqual(
    { name: 'Fozzie' }
  );
});

test('isInTransaction', () => {
  const client = Client.memoryClient();
  client.exec('create table muppets (name varchar(255) unique not null)');

  expect(client.isInTransaction()).toEqual(false);

  client.transaction(() => {
    expect(client.isInTransaction()).toEqual(true);
  });

  expect(client.isInTransaction()).toEqual(false);

  // Also true for a transaction begun by running `begin` directly.
  client.run('begin transaction');
  expect(client.isInTransaction()).toEqual(true);
  client.run('rollback');
  expect(client.isInTransaction()).toEqual(false);
});

test('transactions', () => {
  const client = Client.memoryClient();

  client.exec(
    'create table if not exists muppets (name varchar(255) unique not null)'
  );

  client.run('insert into muppets (name) values (?)', 'Kermit');
  expect(client.one('select count(*) as count from muppets')).toEqual({
    count: 1,
  });

  // Should roll back on synchronous exception:
  expect(() =>
    client.transaction(() => {
      client.run('insert into muppets (name) values (?)', 'Fozzie');
      expect(client.one('select count(*) as count from muppets')).toEqual({
        count: 2,
      });
      throw new Error('rollback');
    })
  ).toThrow('rollback');
  expect(client.one('select count(*) as count from muppets')).toEqual({
    count: 1,
  });

  // Should commit by default, if no exceptions occur:
  client.transaction(() => {
    client.run('insert into muppets (name) values (?)', 'Fozzie');
  });
  expect(client.one('select count(*) as count from muppets')).toEqual({
    count: 2,
  });

  // Should roll back if `shouldCommit` test returns false:
  expect(
    client.transaction(
      () => {
        client.run('insert into muppets (name) values (?)', 'Gonzo');
        expect(client.one('select count(*) as count from muppets')).toEqual({
          count: 3,
        });
        return 'this is a result';
      },
      (result) => {
        expect(result).toEqual('this is a result');
        return false;
      }
    )
  ).toEqual('this is a result');
  expect(client.one('select count(*) as count from muppets')).toEqual({
    count: 2,
  });

  // Should commit if `shouldCommit` test returns true:
  expect(
    client.transaction(
      () => {
        client.run('insert into muppets (name) values (?)', 'Gonzo');
        return 'another result';
      },
      (result) => {
        expect(result).toEqual('another result');
        return true;
      }
    )
  ).toEqual('another result');
  expect(client.one('select count(*) as count from muppets')).toEqual({
    count: 3,
  });
});

test('prepared statements', () => {
  const client = Client.memoryClient();

  client.exec(
    'create table if not exists muppets (name varchar(255) unique not null)'
  );
  const insertMuppet: Statement<[string]> = client.prepare(
    'insert into muppets (name) values (?)'
  );
  client.run(insertMuppet, 'Kermit');
  client.run(insertMuppet, 'Fozzie');

  const selectMuppet: Statement<[string]> = client.prepare(
    'select * from muppets where name = ?'
  );
  expect(client.one(selectMuppet, 'Kermit')).toEqual({ name: 'Kermit' });
  expect(client.all(selectMuppet, 'Fozzie')).toEqual([{ name: 'Fozzie' }]);
  expect([...client.each(selectMuppet, 'Fozzie')]).toEqual([
    { name: 'Fozzie' },
  ]);
  expect(client.one(selectMuppet, 'Fozzie')).toEqual({ name: 'Fozzie' });
});

test('schema loading', () => {
  const schemaFile = makeTemporaryFile();
  fs.writeFileSync(
    schemaFile,
    `create table if not exists muppets (name varchar(255) unique not null);`
  );

  const client = Client.memoryClient(schemaFile);
  client.run('insert into muppets (name) values (?)', 'Kermit');
});

test('runtime errors', () => {
  const client = Client.memoryClient();

  expect(() => client.run('select * from muppets')).toThrow(
    'no such table: muppets'
  );

  expect(() => client.exec('select * from muppets')).toThrow(
    'no such table: muppets'
  );

  expect(() => client.all('select * from muppets')).toThrow(
    'no such table: muppets'
  );

  expect(() => client.one('select * from muppets')).toThrow(
    'no such table: muppets'
  );

  expect(() => [...client.each('select * from muppets')]).toThrow(
    'no such table: muppets'
  );
});

test('#each', () => {
  const client = Client.memoryClient();

  client.exec(
    'create table if not exists muppets (name varchar(255) unique not null)'
  );
  client.run('insert into muppets (name) values (?)', 'Kermit');
  client.run('insert into muppets (name) values (?)', 'Fozzie');

  const row = client.each('select * from muppets').next().value;
  expect(row).toEqual({ name: 'Kermit' });
});

test('connect errors', () => {
  const client = Client.fileClient(
    '/not/a/real/path',
    mockBaseLogger({ fn: vi.fn })
  );
  expect(() => client.connect()).toThrow();
});

const SCHEMA_V1 = 'create table users (id text primary key);';
const SCHEMA_V2 = 'create table users (id text primary key, name text);';

function makeSchemaFile(content: string): string {
  return makeTemporaryFile({ content });
}

function makeDbWithSchema(schemaPath: string): string {
  const dbFile = makeTemporaryFile();
  const client = Client.fileClient(
    dbFile,
    mockBaseLogger({ fn: vi.fn }),
    schemaPath
  );
  client.run(`insert into users (id) values (?)`, 'kermit');
  return dbFile;
}

function stubProductionEnv(): void {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('REACT_APP_VX_DEV', '');
  vi.stubEnv('REACT_APP_IS_INTEGRATION_TEST', '');
  vi.stubEnv('IS_INTEGRATION_TEST', '');
  vi.stubEnv('DEPLOY_ENV', '');
}

function backupFilesFor(dbFile: string): string[] {
  return fs
    .readdirSync(dirname(dbFile))
    .filter((name) => name.startsWith(`${basename(dbFile)}.backup-`));
}

test('stores the schema digest in the database rather than a sidecar file', () => {
  const schemaFile = makeSchemaFile(SCHEMA_V1);
  const dbFile = makeDbWithSchema(schemaFile);

  expect(fs.existsSync(`${dbFile}.digest`)).toEqual(false);

  const client = Client.fileClient(
    dbFile,
    mockBaseLogger({ fn: vi.fn }),
    schemaFile
  );
  expect(client.one('select digest from vx_schema_digest')).toEqual({
    digest: expect.stringMatching(/^[0-9a-f]{64}$/),
  });

  // reopening with an unchanged schema preserves the data
  expect(client.one('select count(*) as count from users')).toEqual({
    count: 1,
  });
});

test('reopens a database whose digest is stored inside it even with no sidecar', () => {
  const schemaFile = makeSchemaFile(SCHEMA_V1);
  const dbFile = makeDbWithSchema(schemaFile);

  // a stale sidecar left over from older software is ignored in favor of the
  // digest stored in the database
  fs.writeFileSync(`${dbFile}.digest`, 'stale-digest-from-older-software');

  const client = Client.fileClient(
    dbFile,
    mockBaseLogger({ fn: vi.fn }),
    schemaFile
  );
  expect(client.one('select count(*) as count from users')).toEqual({
    count: 1,
  });
  expect(backupFilesFor(dbFile)).toEqual([]);
});

test('resets the database when the schema changes outside production', () => {
  const dbFile = makeDbWithSchema(makeSchemaFile(SCHEMA_V1));

  const client = Client.fileClient(
    dbFile,
    mockBaseLogger({ fn: vi.fn }),
    makeSchemaFile(SCHEMA_V2)
  );

  // reset to the new schema, losing the old data
  expect(client.one('select count(*) as count from users')).toEqual({
    count: 0,
  });
  client.run(`insert into users (id, name) values (?, ?)`, 'fozzie', 'Fozzie');

  // the old database was preserved alongside it
  expect(backupFilesFor(dbFile)).toHaveLength(1);
});

test('refuses to reset the database when the schema changes in production', () => {
  const dbFile = makeDbWithSchema(makeSchemaFile(SCHEMA_V1));
  const contentsBefore = fs.readFileSync(dbFile);

  stubProductionEnv();

  expect(() =>
    Client.fileClient(
      dbFile,
      mockBaseLogger({ fn: vi.fn }),
      makeSchemaFile(SCHEMA_V2)
    )
  ).toThrow(SchemaDigestMismatchError);

  // the database is left exactly as it was
  expect(fs.readFileSync(dbFile)).toEqual(contentsBefore);
  expect(backupFilesFor(dbFile)).toEqual([]);
});

test('adopts a legacy schema digest sidecar written by older software', () => {
  const schemaFile = makeSchemaFile(SCHEMA_V1);
  const dbFile = makeDbWithSchema(schemaFile);

  // simulate a database created by software that stored the digest alongside
  // the database instead of inside it
  const { digest } = Client.fileClient(
    dbFile,
    mockBaseLogger({ fn: vi.fn }),
    schemaFile
  ).one('select digest from vx_schema_digest') as { digest: string };
  const clientToStrip = Client.fileClient(
    dbFile,
    mockBaseLogger({ fn: vi.fn })
  );
  clientToStrip.exec('drop table vx_schema_digest');
  fs.writeFileSync(`${dbFile}.digest`, digest);

  stubProductionEnv();

  const client = Client.fileClient(
    dbFile,
    mockBaseLogger({ fn: vi.fn }),
    schemaFile
  );

  // the data survives, the digest moves into the database, and the sidecar goes
  expect(client.one('select count(*) as count from users')).toEqual({
    count: 1,
  });
  expect(client.one('select digest from vx_schema_digest')).toEqual({ digest });
  expect(fs.existsSync(`${dbFile}.digest`)).toEqual(false);
});

test('treats a stale legacy sidecar as a schema mismatch', () => {
  const dbFile = makeDbWithSchema(makeSchemaFile(SCHEMA_V1));
  const clientToStrip = Client.fileClient(
    dbFile,
    mockBaseLogger({ fn: vi.fn })
  );
  clientToStrip.exec('drop table vx_schema_digest');
  fs.writeFileSync(`${dbFile}.digest`, 'digest-from-an-older-schema');

  stubProductionEnv();

  expect(() =>
    Client.fileClient(
      dbFile,
      mockBaseLogger({ fn: vi.fn }),
      makeSchemaFile(SCHEMA_V1)
    )
  ).toThrow(SchemaDigestMismatchError);
});

test('refuses to reset an unreadable database in production', () => {
  const dbFile = makeTemporaryFile({
    content: 'this is not a sqlite database',
  });

  stubProductionEnv();

  expect(() =>
    Client.fileClient(
      dbFile,
      mockBaseLogger({ fn: vi.fn }),
      makeSchemaFile(SCHEMA_V1)
    )
  ).toThrow(SchemaDigestMismatchError);
  expect(fs.readFileSync(dbFile, 'utf-8')).toEqual(
    'this is not a sqlite database'
  );
});

test('creates the schema in an empty database file', () => {
  const dbFile = makeTemporaryFile();
  fs.writeFileSync(`${dbFile}.digest`, 'stale-sidecar');

  stubProductionEnv();

  const client = Client.fileClient(
    dbFile,
    mockBaseLogger({ fn: vi.fn }),
    makeSchemaFile(SCHEMA_V1)
  );

  expect(client.one('select count(*) as count from users')).toEqual({
    count: 0,
  });
  expect(fs.existsSync(`${dbFile}.digest`)).toEqual(false);
});

test('file databases use write-ahead logging with full sync', () => {
  const dbFile = makeTemporaryFile();
  const logger = mockBaseLogger({ fn: vi.fn });
  Client.fileClient(dbFile, logger).run('create table t (x)');
  const client = Client.fileClient(dbFile, logger);
  expect(client.one('pragma journal_mode')).toEqual({ journal_mode: 'wal' });
  expect(client.one('pragma synchronous')).toEqual({ synchronous: 2 });
  expect(Client.memoryClient().one('pragma journal_mode')).toEqual({
    journal_mode: 'memory',
  });
});

test('vacuuming reduces file size', () => {
  const dbFile = makeTemporaryFile();
  const schemaFile = join(import.meta.dirname, '../test/fixtures/schema.sql');
  const client = Client.fileClient(
    dbFile,
    mockBaseLogger({ fn: vi.fn }),
    schemaFile
  );

  expect(client.one('select count(*) as count from users')).toEqual({
    count: 0,
  });

  client.checkpoint();
  const preInsertSize = fs.statSync(dbFile).size;

  client.transaction(() => {
    for (let i = 0; i < 1000; i += 1) {
      client.run(
        `
      insert into users (
        id,
        name,
        email,
        password_hash
      ) values (
        ?, ?, ?, ?
      )
    `,
        `user-${i}`,
        'User',
        'user@email.org',
        'hash'
      );
    }
  });

  client.checkpoint();
  const postInsertSize = fs.statSync(dbFile).size;
  client.run('delete from users');
  client.checkpoint();
  const postDeleteSize = fs.statSync(dbFile).size;
  client.vacuum();
  const postVacuumSize = fs.statSync(dbFile).size;

  // we reclaim all the space from the deleted rows
  expect(postVacuumSize).toEqual(preInsertSize);

  // deleting rows does not actually reduce the file size
  expect(postDeleteSize).toEqual(postInsertSize);

  // vacuuming reduces the file size
  expect(postDeleteSize).toBeGreaterThan(postVacuumSize);
});

/**
 * A path for a snapshot to be written to. Not `makeTemporaryFile`, which
 * creates the file: a destination SQLite did not create is one it does not
 * remove when it refuses to copy.
 */
function makeSnapshotPath(): string {
  return join(makeTemporaryDirectory(), 'snapshot.db');
}

/**
 * Builds a client whose database takes several steps to copy, so that a
 * snapshot of it reports progress more than once and can be stopped partway.
 */
function makeClientWithLargeDatabase(): Client {
  const client = Client.fileClient(
    makeTemporaryFile(),
    mockBaseLogger({ fn: vi.fn })
  );
  client.exec('create table blobs (data blob not null)');
  for (let i = 0; i < 200; i += 1) {
    client.run('insert into blobs (data) values (?)', Buffer.alloc(64 * 1024));
  }
  return client;
}

test('backup reports how much of the database it has copied', async () => {
  const client = makeClientWithLargeDatabase();
  const fractions: number[] = [];

  expect(
    await client.backup(makeSnapshotPath(), {
      onProgress: (fraction) => fractions.push(fraction),
    })
  ).toEqual(ok());

  expect(fractions.length).toBeGreaterThan(1);
  expect(fractions.every((f) => f >= 0 && f <= 1)).toEqual(true);
  expect(fractions).toEqual([...fractions].sort((a, b) => a - b));
  expect(fractions.at(-1)).toEqual(1);
});

test('backup refuses while this connection is partway through writing', async () => {
  const client = Client.memoryClient();
  client.exec('create table muppets (name varchar(255) not null)');
  client.run('begin transaction');

  // SQLite will not copy a page while a write transaction is open on the
  // connection running the copy, and `better-sqlite3` reports that refusal as
  // a copy that finished with nothing left to do.
  expect(await client.backup(makeSnapshotPath())).toEqual(
    err(typedAs<BackupError>({ type: 'write-in-progress' }))
  );

  client.run('rollback');
});

test('backup catches a write that begins after it checks', async () => {
  const client = makeClientWithLargeDatabase();
  const backupDbFile = makeSnapshotPath();

  // Slip the write in after the check, to stand in for the window between it
  // and the copy starting. It takes a real write, not just an open
  // transaction, for SQLite to hold the write lock that makes the copy a
  // no-op — which it reports by deleting the destination and claiming success.
  vi.spyOn(client, 'isInTransaction').mockImplementationOnce(() => {
    client.run('begin transaction');
    client.run('insert into blobs (data) values (?)', Buffer.alloc(1));
    return false;
  });

  expect(await client.backup(backupDbFile)).toEqual(
    err(typedAs<BackupError>({ type: 'write-in-progress' }))
  );
  expect(fs.existsSync(backupDbFile)).toEqual(false);

  client.run('rollback');
});

test('backup does not start once its signal has aborted', async () => {
  const client = makeClientWithLargeDatabase();
  const backupDbFile = makeSnapshotPath();

  expect(
    await client.backup(backupDbFile, { signal: AbortSignal.abort() })
  ).toEqual(err(typedAs<BackupError>({ type: 'cancelled' })));

  expect(fs.existsSync(backupDbFile)).toEqual(false);
});

test('backup stopped partway leaves no partial snapshot', async () => {
  const client = makeClientWithLargeDatabase();
  const backupDbFile = makeSnapshotPath();
  const controller = new AbortController();

  expect(
    await client.backup(backupDbFile, {
      signal: controller.signal,
      onProgress: () => controller.abort(),
    })
  ).toEqual(err(typedAs<BackupError>({ type: 'cancelled' })));

  // Half a database is not something anyone should find where a snapshot was
  // asked for.
  expect(fs.existsSync(backupDbFile)).toEqual(false);
});

test('backup surfaces a failure that is not a refusal or a cancellation', async () => {
  const client = makeClientWithLargeDatabase();

  await expect(
    client.backup(join(makeTemporaryDirectory(), 'no-such-dir', 'snapshot.db'))
  ).rejects.toThrow('directory does not exist');
});

test('transaction rejects an async function', () => {
  const client = Client.memoryClient();
  client.run('create table t (id integer primary key)');

  expect(() =>
    client.transaction(
      // @ts-expect-error - async bodies are rejected
      async () => {
        await Promise.resolve();
      }
    )
  ).toThrowError(/synchronous/);

  expect(client.isInTransaction()).toEqual(false);
  client.run('insert into t (id) values (1)');
  expect(client.one('select count(*) as count from t')).toEqual({ count: 1 });
});

function fileClientWithUsers(count: number): Client {
  const client = Client.fileClient(
    makeTemporaryFile(),
    mockBaseLogger({ fn: vi.fn }),
    join(import.meta.dirname, '../test/fixtures/schema.sql')
  );
  client.transaction(() => {
    for (const i of range(0, count)) {
      client.run(
        `INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)`,
        `user${i}`,
        `User ${i}`,
        `user${i}@example.com`,
        'hash'
      );
    }
  });
  return client;
}

test('eachAsync reads a snapshot without blocking writes', async () => {
  const client = fileClientWithUsers(501);

  const ids: unknown[] = [];
  for await (const row of client.eachAsync('SELECT id FROM users')) {
    ids.push((row as { id: string }).id);
    if (ids.length === 1) {
      client.run('DELETE FROM users');
    }
  }

  expect(ids).toHaveLength(501);
  expect(
    await iter(client.eachAsync('SELECT id FROM users')).toArray()
  ).toEqual([]);
  client.close();
});

test('eachAsync cannot be used inside a transaction', async () => {
  const client = fileClientWithUsers(1);

  let next: Promise<unknown> | undefined;
  client.transaction(() => {
    next = client.eachAsync('SELECT id FROM users').next();
  });

  await expect(next).rejects.toThrow(/inside a transaction/);
});

test('each does not block queries on the main connection', () => {
  const client = fileClientWithUsers(2);

  const ids: unknown[] = [];
  for (const row of client.each('SELECT id FROM users ORDER BY id')) {
    ids.push((row as { id: string }).id);
    client.run('DELETE FROM users');
  }

  expect(ids).toEqual(['user0', 'user1']);
  expect(client.all('SELECT id FROM users')).toEqual([]);
  client.close();
});

test('totalChanges counts rows changed through the main connection', () => {
  const client = fileClientWithUsers(3);
  const before = client.totalChanges();

  client.run('DELETE FROM users');
  expect(client.totalChanges() - before).toEqual(3);
  client.close();
});

import { afterEach, expect, test, vi } from 'vitest';
import { SqliteError } from 'better-sqlite3';
import * as fs from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { makeTemporaryFile } from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import { Client, DbConnectionOptions, Statement } from './client';
import { SchemaDigestMismatchError } from './schema_digest_mismatch_error';

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
  await client.backup(backupDbFile);

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
  await client.backup(backupDbFile);

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
  await client.backup(backupDbFile);

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
  const schemaFile = join(__dirname, '../test/fixtures/schema.sql');
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
  const schemaFile = join(__dirname, '../test/fixtures/schema.sql');
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

test('reset file database client that has not connected yet', () => {
  const dbFile = makeTemporaryFile();
  const client = Client.fileClient(dbFile, mockBaseLogger({ fn: vi.fn }));

  client.reset();

  client.exec('create table muppets (name varchar(255) not null)');
  client.run('insert into muppets (name) values (?)', 'Kermit');
  expect(client.all('select * from muppets')).toEqual([{ name: 'Kermit' }]);
});

test('memory database client, reset', () => {
  const schemaFile = join(__dirname, '../test/fixtures/schema.sql');
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

test('transactions', async () => {
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

  // Should roll back on async exception:
  await expect(() =>
    client.transaction(() => {
      client.run('insert into muppets (name) values (?)', 'Fozzie');
      expect(client.one('select count(*) as count from muppets')).toEqual({
        count: 2,
      });
      return Promise.reject(new Error('rollback'));
    })
  ).rejects.toThrow('rollback');
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
  await expect(
    client.transaction(
      () => {
        client.run('insert into muppets (name) values (?)', 'Gonzo');
        return Promise.resolve('another result');
      },
      (result) => {
        expect(result).toEqual('another result');
        return true;
      }
    )
  ).resolves.toEqual('another result');
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

test('vacuuming reduces file size', () => {
  const dbFile = makeTemporaryFile();
  const schemaFile = join(__dirname, '../test/fixtures/schema.sql');
  const client = Client.fileClient(
    dbFile,
    mockBaseLogger({ fn: vi.fn }),
    schemaFile
  );

  expect(client.one('select count(*) as count from users')).toEqual({
    count: 0,
  });

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

  const postInsertSize = fs.statSync(dbFile).size;
  client.run('delete from users');
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

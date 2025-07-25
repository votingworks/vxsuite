import { expect, test, vi } from 'vitest';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { makeTemporaryFile } from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import { Client, DbConnectionOptions, Statement } from './client';

test('file database client', () => {
  const dbFile = makeTemporaryFile();
  const client = Client.fileClient(dbFile, mockBaseLogger({ fn: vi.fn }));

  client.reset();
  fs.accessSync(dbFile);

  expect(client.getDatabasePath()).toEqual(dbFile);
  expect(client.isMemoryDatabase()).toEqual(false);

  client.exec(
    'create table if not exists muppets (name varchar(255) unique not null)'
  );
  client.run('insert into muppets (name) values (?)', 'Kermit');
  client.run('insert into muppets (name) values (?)', 'Fozzie');

  const backupDbFile = makeTemporaryFile();
  client.backup(backupDbFile);

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

  client.destroy();
  expect(() => fs.accessSync(dbFile)).toThrowError('ENOENT');
});

test('file database client with a schema', () => {
  const dbFile = makeTemporaryFile();
  const schemaFile = join(__dirname, '../test/fixtures/schema.sql');
  const client = Client.fileClient(
    dbFile,
    mockBaseLogger({ fn: vi.fn }),
    schemaFile
  );

  client.reset();
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

  client.reset();
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
    new Error('no such function: REGEXP')
  );

  client.destroy();
});

test('memory database client', () => {
  const client = Client.memoryClient();

  client.reset();

  expect(client.getDatabasePath()).toEqual(':memory:');
  expect(client.isMemoryDatabase()).toEqual(true);

  client.destroy();
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

test('destroy errors', () => {
  const file = makeTemporaryFile();
  const client = Client.fileClient(file, mockBaseLogger({ fn: vi.fn }));
  client.connect();
  fs.unlinkSync(file);
  expect(() => client.destroy()).toThrow();
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

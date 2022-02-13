import * as fs from 'fs-extra';
import * as tmp from 'tmp';
import { DbClient } from './db_client';

test('file database client', async () => {
  const dbFile = tmp.fileSync();
  const client = await DbClient.fileClient(dbFile.name);

  await client.reset();
  await fs.access(dbFile.name);

  expect(client.getDatabasePath()).toBe(dbFile.name);
  expect(client.isMemoryDatabase()).toBe(false);

  await client.exec(
    'create table if not exists muppets (name varchar(255) unique not null)'
  );
  await client.run('insert into muppets (name) values (?)', 'Kermit');
  await client.run('insert into muppets (name) values (?)', 'Fozzie');

  const backupDbFile = tmp.fileSync();
  await client.backup(backupDbFile.name);

  const clientForBackup = await DbClient.fileClient(backupDbFile.name);
  expect(await clientForBackup.all('select * from muppets')).toEqual([
    { name: 'Kermit' },
    { name: 'Fozzie' },
  ]);

  await client.destroy();
  await expect(fs.access(dbFile.name)).rejects.toThrowError('ENOENT');
});

test('memory database client', async () => {
  const client = await DbClient.memoryClient();

  await client.reset();

  expect(client.getDatabasePath()).toEqual(':memory:');
  expect(client.isMemoryDatabase()).toBe(true);

  await client.destroy();
});

test('read/write', async () => {
  const client = await DbClient.memoryClient();

  await client.exec(
    'create table if not exists muppets (name varchar(255) unique not null)'
  );
  expect(await client.all('select * from muppets')).toEqual([]);
  expect(await client.one('select * from muppets')).toBeUndefined();

  await client.run('insert into muppets (name) values (?)', 'Kermit');
  await client.run('insert into muppets (name) values (?)', 'Fozzie');

  expect(await client.all('select * from muppets')).toEqual([
    { name: 'Kermit' },
    { name: 'Fozzie' },
  ]);
  expect(await client.one('select * from muppets')).toEqual({ name: 'Kermit' });
  expect(
    await client.one('select * from muppets where name != ?', 'Kermit')
  ).toEqual({ name: 'Fozzie' });
});

test('transactions', async () => {
  const client = await DbClient.memoryClient();

  await client.exec(
    'create table if not exists muppets (name varchar(255) unique not null)'
  );

  await client.run('insert into muppets (name) values (?)', 'Kermit');
  expect(await client.one('select count(*) as count from muppets')).toEqual({
    count: 1,
  });

  await expect(
    client.transaction(async () => {
      await client.run('insert into muppets (name) values (?)', 'Fozzie');
      expect(
        await client.one('select count(*) as count from muppets')
      ).toEqual({ count: 2 });
      throw new Error('rollback');
    })
  ).rejects.toThrow('rollback');
  expect(await client.one('select count(*) as count from muppets')).toEqual({
    count: 1,
  });

  await client.transaction(async () => {
    await client.run('insert into muppets (name) values (?)', 'Fozzie');
  });
  expect(await client.one('select count(*) as count from muppets')).toEqual({
    count: 2,
  });
});

test('schema loading', async () => {
  const schemaFile = tmp.fileSync();
  await fs.writeFile(
    schemaFile.name,
    `create table if not exists muppets (name varchar(255) unique not null);`
  );

  const client = await DbClient.memoryClient(schemaFile.name);
  await client.run('insert into muppets (name) values (?)', 'Kermit');
});

test('runtime errors', async () => {
  const client = await DbClient.memoryClient();

  await expect(client.run('select * from muppets')).rejects.toThrow(
    'SQLITE_ERROR: no such table: muppets'
  );

  await expect(client.exec('select * from muppets')).rejects.toThrow(
    'SQLITE_ERROR: no such table: muppets'
  );

  await expect(client.all('select * from muppets')).rejects.toThrow(
    'SQLITE_ERROR: no such table: muppets'
  );

  await expect(client.one('select * from muppets')).rejects.toThrow(
    'SQLITE_ERROR: no such table: muppets'
  );
});

test('connect errors', async () => {
  const client = await DbClient.fileClient('/not/a/real/path');
  await expect(client.connect()).rejects.toThrow();
});

test('destroy errors', async () => {
  const file = tmp.fileSync();
  const client = await DbClient.fileClient(file.name);
  await client.connect();
  file.removeCallback();
  await expect(client.destroy()).rejects.toThrow();
});

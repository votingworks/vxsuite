import { expect, test } from 'vitest';
import { makeTemporaryFile } from '@votingworks/fixtures';
import { Client } from './client';
import { findSchemaViolations } from './schema_validation';

function clientWithSchema(schema: string): Client {
  const client = Client.memoryClient();
  client.exec(schema);
  return client;
}

test('no violations in a valid schema', () => {
  const client = clientWithSchema(`
    create table elections (
      id text primary key,
      created_at text not null default current_timestamp
    ) strict;

    create table cvrs (
      id text primary key,
      election_id text not null,
      foreign key (election_id) references elections(id)
    ) strict;

    create table cvr_write_ins (
      cvr_id text primary key,
      foreign key (cvr_id) references cvrs
    ) strict;
  `);

  expect(findSchemaViolations(client)).toEqual([]);
});

test('flags tables that are not strict', () => {
  const client = clientWithSchema(`
    create table strict_table (id text primary key) strict;
    create table lax_table (id serial primary key);
  `);

  expect(findSchemaViolations(client)).toEqual([
    'table lax_table is not declared strict',
  ]);
});

test('flags foreign keys whose type differs from the column they reference', () => {
  const client = clientWithSchema(`
    create table elections (id text primary key) strict;

    create table cvrs (
      id text primary key,
      election_id integer not null,
      foreign key (election_id) references elections(id)
    ) strict;
  `);

  expect(findSchemaViolations(client)).toEqual([
    'cvrs.election_id is declared integer but references elections.id, which is declared text',
  ]);
});

test('flags foreign keys referencing a table outside the schema', () => {
  const client = clientWithSchema(`
    create table cvrs (
      id text primary key,
      election_id text not null references elections(id)
    ) strict;
  `);

  expect(findSchemaViolations(client)).toEqual([
    'cvrs.election_id references unknown table elections',
  ]);
});

test('flags foreign keys referencing a column the table does not have', () => {
  const client = clientWithSchema(`
    create table elections (id text primary key) strict;

    create table cvrs (
      id text primary key,
      election_id text not null references elections(election_id)
    ) strict;
  `);

  expect(findSchemaViolations(client)).toEqual([
    'cvrs.election_id references unknown column elections.election_id',
  ]);
});

test('flags implicit references to a table with no primary key', () => {
  const client = clientWithSchema(`
    create table elections (id text not null) strict;

    create table cvrs (
      id text primary key,
      election_id text not null references elections
    ) strict;
  `);

  expect(findSchemaViolations(client)).toEqual([
    'cvrs.election_id references unknown column elections.<primary key>',
  ]);
});

test('reports every violation in a composite foreign key', () => {
  const client = clientWithSchema(`
    create table precincts (
      election_id text not null,
      id text not null,
      primary key (election_id, id)
    ) strict;

    create table precinct_voter_counts (
      election_id integer not null,
      precinct_id integer not null,
      foreign key (election_id, precinct_id) references precincts
    ) strict;
  `);

  expect(findSchemaViolations(client)).toEqual([
    'precinct_voter_counts.election_id is declared integer but references precincts.election_id, which is declared text',
    'precinct_voter_counts.precinct_id is declared integer but references precincts.id, which is declared text',
  ]);
});

test('assertSchemaIsValid does nothing for a valid schema', () => {
  const client = clientWithSchema('create table muppets (name text) strict;');

  expect(() => client.assertSchemaIsValid()).not.toThrow();
});

test('assertSchemaIsValid reports every violation at once', () => {
  const client = clientWithSchema(`
    create table elections (id text primary key);

    create table cvrs (
      id text primary key,
      election_id integer not null,
      foreign key (election_id) references elections(id)
    ) strict;
  `);

  expect(() => client.assertSchemaIsValid()).toThrowError(
    `invalid schema at :memory::
  - table elections is not declared strict
  - cvrs.election_id is declared integer but references elections.id, which is declared text`
  );
});

test('assertSchemaIsValid names the schema file when there is one', () => {
  const schemaPath = makeTemporaryFile({
    content: 'create table muppets (name text);',
  });

  expect(() => Client.memoryClient(schemaPath).assertSchemaIsValid())
    .toThrowError(`invalid schema at ${schemaPath}:
  - table muppets is not declared strict`);
});

import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { Client as DbClient } from '@votingworks/db';
import { Db, runDesignMigrations } from '@votingworks/design-store-pg';
import { BaseLogger, LogSource } from '@votingworks/logging';

const SQLITE_SCHEMA_PATH = join(import.meta.dirname, '../../schema.sql');
const SQLITE_TABLE_PREFIX = 'design_';

const SHARED_TABLES = [
  'elections',
  'districts',
  'precincts',
  'precinct_splits',
  'districts_precincts',
  'districts_precinct_splits',
  'precinct_registered_voter_counts',
  'precinct_split_registered_voter_counts',
  'parties',
  'contests',
  'candidates',
  'candidates_parties',
  'polling_places',
  'polling_places_precincts',
] as const;

const POSTGRES_ONLY_TABLES = [
  'organizations',
  'jurisdictions',
  'background_tasks',
];
const SQLITE_ONLY_TABLES = ['exports'];

const POSTGRES_TO_SQLITE_TYPES: Record<string, string> = {
  text: 'text',
  integer: 'integer',
  boolean: 'integer',
  jsonb: 'text',
  ARRAY: 'text',
  date: 'text',
  'timestamp with time zone': 'text',
  'timestamp without time zone': 'text',
  'USER-DEFINED': 'text',
};

const INTENDED_DIFFERENCES: Record<string, string> = {
  'elections.jurisdiction_id: column only in postgres':
    'VxAdmin has one implicit jurisdiction, so it has no jurisdictions table',
  'elections.election_package_task_id: column only in postgres':
    'VxAdmin tracks its one render in design_exports, not background_tasks',
  'elections.election_package_url: column only in postgres':
    'design_exports.election_package_path',
  'elections.official_ballots_url: column only in postgres':
    'design_exports.official_ballots_path',
  'elections.sample_ballots_url: column only in postgres':
    'design_exports.sample_ballots_path',
  'elections.test_ballots_url: column only in postgres':
    'design_exports.test_ballots_path',
  'elections.last_exported_ballot_hash: column only in postgres':
    'design_exports.ballot_hash',
  'elections.last_exported_election_data: column only in postgres':
    'VxAdmin configures from the package file itself',
  'elections.ballots_approved_at: column only in postgres':
    'VxAdmin has no approve step; finalize is the only gate',
  'elections: foreign key (jurisdiction_id) -> jurisdictions (id) on delete CASCADE only in postgres':
    'no jurisdictions table in VxAdmin',
  'elections: foreign key (election_package_task_id) -> background_tasks (id) on delete SET NULL only in postgres':
    'no background_tasks table in VxAdmin',
  'elections: unique (jurisdiction_id, title, date) only in postgres':
    'VxAdmin holds one election, so titles cannot collide',
  'contests: unique (district_id, title, seats, term_description, party_id) is nulls not distinct only in postgres':
    'SQLite treats NULLs as distinct in unique indexes; DesignStore.assertNoDuplicateContest enforces it in code (contract test: duplicate contests)',
  'candidates: unique (contest_id, first_name, middle_name, last_name) is nulls not distinct only in postgres':
    'SQLite treats NULLs as distinct in unique indexes; DesignStore.assertNoDuplicateCandidate enforces it in code (contract test: duplicate candidates)',
};

interface ColumnShape {
  type: string;
  notNull: boolean;
}

interface ForeignKeyShape {
  columns: string[];
  refTable: string;
  refColumns: string[];
  onDelete: string;
}

interface UniqueShape {
  columns: string[];
  nullsNotDistinct: boolean;
}

interface TableShape {
  columns: Map<string, ColumnShape>;
  primaryKey: string[];
  foreignKeys: ForeignKeyShape[];
  uniques: UniqueShape[];
}

const POSTGRES_ON_DELETE: Record<string, string> = {
  a: 'NO ACTION',
  r: 'RESTRICT',
  c: 'CASCADE',
  n: 'SET NULL',
  d: 'SET DEFAULT',
};

function describeForeignKey(fk: ForeignKeyShape): string {
  return `foreign key (${fk.columns.join(', ')}) -> ${fk.refTable} (${fk.refColumns.join(', ')}) on delete ${fk.onDelete}`;
}

function describeUnique(unique: UniqueShape): string {
  return `unique (${unique.columns.join(', ')})`;
}

function readSqliteSchema(): Map<string, TableShape> {
  const client = DbClient.memoryClient(SQLITE_SCHEMA_PATH);
  const tables = new Map<string, TableShape>();
  const tableNames = (
    client.all(
      `select name from sqlite_schema where type = 'table' and name like '${SQLITE_TABLE_PREFIX}%'`
    ) as Array<{ name: string }>
  ).map((row) => row.name);

  const unprefix = (name: string) => name.slice(SQLITE_TABLE_PREFIX.length);

  for (const tableName of tableNames) {
    const columns = client.all(
      'select name, type, "notnull", pk from pragma_table_info(?)',
      tableName
    ) as Array<{ name: string; type: string; notnull: number; pk: number }>;

    const foreignKeyRows = client.all(
      'select id, seq, "table", "from", "to", on_delete from pragma_foreign_key_list(?) order by id, seq',
      tableName
    ) as Array<{
      id: number;
      table: string;
      from: string;
      to: string;
      on_delete: string;
    }>;
    const foreignKeysById = new Map<number, ForeignKeyShape>();
    for (const row of foreignKeyRows) {
      const fk = foreignKeysById.get(row.id) ?? {
        columns: [],
        refTable: unprefix(row.table),
        refColumns: [],
        onDelete: row.on_delete,
      };
      fk.columns.push(row.from);
      fk.refColumns.push(row.to);
      foreignKeysById.set(row.id, fk);
    }

    const indexes = client.all(
      'select name, "unique", origin from pragma_index_list(?)',
      tableName
    ) as Array<{ name: string; unique: number; origin: string }>;
    const uniques = indexes
      .filter((index) => index.unique === 1 && index.origin !== 'pk')
      .map((index) => ({
        columns: (
          client.all(
            'select name from pragma_index_info(?) order by seqno',
            index.name
          ) as Array<{ name: string }>
        ).map((column) => column.name),
        nullsNotDistinct: false,
      }));

    tables.set(unprefix(tableName), {
      columns: new Map(
        columns.map((column) => [
          column.name,
          {
            type: column.type.toLowerCase(),
            notNull: column.notnull === 1 || column.pk > 0,
          },
        ])
      ),
      primaryKey: columns
        .filter((column) => column.pk > 0)
        .toSorted((a, b) => a.pk - b.pk)
        .map((column) => column.name),
      foreignKeys: [...foreignKeysById.values()],
      uniques,
    });
  }
  client.close();
  return tables;
}

async function readPostgresSchema(db: Db, schemaName: string) {
  return db.withClient(async (client) => {
    const tables = new Map<string, TableShape>();
    const { rows: columnRows } = await client.query(
      `
        select table_name, column_name, data_type, is_nullable
        from information_schema.columns
        where table_schema = $1 and table_name not like 'design_pgmigrations%'
        order by table_name, ordinal_position
      `,
      schemaName
    );
    for (const row of columnRows as Array<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>) {
      const table = tables.get(row.table_name) ?? {
        columns: new Map(),
        primaryKey: [],
        foreignKeys: [],
        uniques: [],
      };
      table.columns.set(row.column_name, {
        type: POSTGRES_TO_SQLITE_TYPES[row.data_type] ?? row.data_type,
        notNull: row.is_nullable === 'NO',
      });
      tables.set(row.table_name, table);
    }

    const { rows: constraintRows } = await client.query(
      `
        select
          rel.relname as table_name,
          con.contype,
          con.confdeltype,
          ref.relname as ref_table,
          array(
            select att.attname::text from unnest(con.conkey) with ordinality k(attnum, i)
            join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
            order by k.i
          )::text[] as columns,
          array(
            select att.attname::text from unnest(con.confkey) with ordinality k(attnum, i)
            join pg_attribute att on att.attrelid = con.confrelid and att.attnum = k.attnum
            order by k.i
          )::text[] as ref_columns
        from pg_constraint con
        join pg_class rel on rel.oid = con.conrelid
        join pg_namespace ns on ns.oid = rel.relnamespace
        left join pg_class ref on ref.oid = con.confrelid
        where ns.nspname = $1 and con.contype in ('p', 'f')
      `,
      schemaName
    );
    for (const row of constraintRows as Array<{
      table_name: string;
      contype: string;
      confdeltype: string;
      ref_table: string;
      columns: string[];
      ref_columns: string[];
    }>) {
      const table = tables.get(row.table_name);
      if (!table) continue;
      if (row.contype === 'p') {
        table.primaryKey = row.columns;
      } else {
        table.foreignKeys.push({
          columns: row.columns,
          refTable: row.ref_table,
          refColumns: row.ref_columns,
          onDelete: POSTGRES_ON_DELETE[row.confdeltype] ?? row.confdeltype,
        });
      }
    }

    const { rows: indexRows } = await client.query(
      `
        select
          tbl.relname as table_name,
          idx.indnullsnotdistinct as nulls_not_distinct,
          array(
            select att.attname::text from unnest(idx.indkey) with ordinality k(attnum, i)
            join pg_attribute att on att.attrelid = idx.indrelid and att.attnum = k.attnum
            order by k.i
          )::text[] as columns
        from pg_index idx
        join pg_class tbl on tbl.oid = idx.indrelid
        join pg_namespace ns on ns.oid = tbl.relnamespace
        where ns.nspname = $1 and idx.indisunique and not idx.indisprimary
      `,
      schemaName
    );
    for (const row of indexRows as Array<{
      table_name: string;
      nulls_not_distinct: boolean;
      columns: string[];
    }>) {
      tables.get(row.table_name)?.uniques.push({
        columns: row.columns,
        nullsNotDistinct: row.nulls_not_distinct,
      });
    }
    return tables;
  });
}

function compareTables(
  postgres: Map<string, TableShape>,
  sqlite: Map<string, TableShape>
): string[] {
  const differences: string[] = [];

  for (const name of postgres.keys()) {
    if (!sqlite.has(name) && !POSTGRES_ONLY_TABLES.includes(name)) {
      differences.push(`${name}: table only in postgres`);
    }
  }
  for (const name of sqlite.keys()) {
    if (!postgres.has(name) && !SQLITE_ONLY_TABLES.includes(name)) {
      differences.push(`${name}: table only in sqlite`);
    }
  }

  for (const name of SHARED_TABLES) {
    const pg = postgres.get(name);
    const lite = sqlite.get(name);
    if (!pg || !lite) {
      differences.push(`${name}: shared table missing`);
      continue;
    }

    for (const [column, pgColumn] of pg.columns) {
      const liteColumn = lite.columns.get(column);
      if (!liteColumn) {
        differences.push(`${name}.${column}: column only in postgres`);
        continue;
      }
      if (pgColumn.type !== liteColumn.type) {
        differences.push(
          `${name}.${column}: type maps to ${pgColumn.type} in postgres but is ${liteColumn.type} in sqlite`
        );
      }
      if (pgColumn.notNull !== liteColumn.notNull) {
        differences.push(
          `${name}.${column}: ${pgColumn.notNull ? 'not null' : 'nullable'} in postgres but ${liteColumn.notNull ? 'not null' : 'nullable'} in sqlite`
        );
      }
    }
    for (const column of lite.columns.keys()) {
      if (!pg.columns.has(column)) {
        differences.push(`${name}.${column}: column only in sqlite`);
      }
    }

    if (pg.primaryKey.join(',') !== lite.primaryKey.join(',')) {
      differences.push(
        `${name}: primary key (${pg.primaryKey.join(', ')}) in postgres but (${lite.primaryKey.join(', ')}) in sqlite`
      );
    }

    const pgForeignKeys = new Set(pg.foreignKeys.map(describeForeignKey));
    const liteForeignKeys = new Set(lite.foreignKeys.map(describeForeignKey));
    for (const fk of pgForeignKeys) {
      if (!liteForeignKeys.has(fk)) {
        differences.push(`${name}: ${fk} only in postgres`);
      }
    }
    for (const fk of liteForeignKeys) {
      if (!pgForeignKeys.has(fk)) {
        differences.push(`${name}: ${fk} only in sqlite`);
      }
    }

    const liteUniques = new Map(
      lite.uniques.map((unique) => [describeUnique(unique), unique])
    );
    const pgUniques = new Map(
      pg.uniques.map((unique) => [describeUnique(unique), unique])
    );
    for (const [description, unique] of pgUniques) {
      const liteUnique = liteUniques.get(description);
      if (!liteUnique) {
        differences.push(`${name}: ${description} only in postgres`);
      } else if (unique.nullsNotDistinct && !liteUnique.nullsNotDistinct) {
        differences.push(
          `${name}: ${description} is nulls not distinct only in postgres`
        );
      }
    }
    for (const description of liteUniques.keys()) {
      if (!pgUniques.has(description)) {
        differences.push(`${name}: ${description} only in sqlite`);
      }
    }
  }

  return differences.toSorted();
}

const schemaName = `parity_${randomUUID().replaceAll('-', '_')}`;
const db = new Db(new BaseLogger(LogSource.System), {
  defaultSchemaName: schemaName,
});

beforeAll(async () => {
  await db.withClient((client) =>
    runDesignMigrations(client, { schemaName, noLock: true })
  );
});

afterAll(async () => {
  await db.withClient((client) =>
    client.query(`drop schema if exists ${schemaName} cascade`)
  );
  await db.close();
});

test('the SQLite design schema matches the Postgres design schema, except for intended differences', async () => {
  const differences = compareTables(
    await readPostgresSchema(db, schemaName),
    readSqliteSchema()
  );

  const unexpected = differences.filter(
    (difference) => !(difference in INTENDED_DIFFERENCES)
  );
  const staleAllowances = Object.keys(INTENDED_DIFFERENCES).filter(
    (difference) => !differences.includes(difference)
  );

  expect({ unexpected, staleAllowances }).toEqual({
    unexpected: [],
    staleAllowances: [],
  });
});

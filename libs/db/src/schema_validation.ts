import type { Client } from './client';

interface TableListRow {
  name: string;
  strict: number;
}

interface TableInfoRow {
  name: string;
  type: string;
  pk: number;
}

interface ForeignKeyListRow {
  seq: number;
  table: string;
  from: string;
  to: string | null;
}

interface TableSchema {
  name: string;
  isStrict: boolean;
  columnTypes: ReadonlyMap<string, string>;
  primaryKeyColumns: string[];
}

function readTableSchemas(client: Client): Map<string, TableSchema> {
  const tables = client.all(
    `
    select name, strict
    from pragma_table_list
    where schema = 'main' and type = 'table' and name not like 'sqlite_%'
    order by name
    `
  ) as TableListRow[];

  return new Map(
    tables.map((table) => {
      const columns = client.all(
        'select name, type, pk from pragma_table_info(?) order by cid',
        table.name
      ) as TableInfoRow[];

      return [
        table.name.toLowerCase(),
        {
          name: table.name,
          isStrict: table.strict !== 0,
          columnTypes: new Map(
            columns.map((column) => [
              column.name.toLowerCase(),
              column.type.toLowerCase(),
            ])
          ),
          primaryKeyColumns: columns
            .filter((column) => column.pk > 0)
            .sort((a, b) => a.pk - b.pk)
            .map((column) => column.name),
        },
      ];
    })
  );
}

function findForeignKeyViolations(
  client: Client,
  table: TableSchema,
  schemasByTableName: ReadonlyMap<string, TableSchema>
): string[] {
  const violations: string[] = [];

  const foreignKeys = client.all(
    'select seq, "table", "from", "to" from pragma_foreign_key_list(?)',
    table.name
  ) as ForeignKeyListRow[];

  for (const foreignKey of foreignKeys) {
    const referencedTable = schemasByTableName.get(
      foreignKey.table.toLowerCase()
    );

    if (!referencedTable) {
      violations.push(
        `${table.name}.${foreignKey.from} references unknown table ${foreignKey.table}`
      );
      continue;
    }

    // A foreign key with no explicit column list references the primary key of
    // the referenced table, one column per position in the key.
    const referencedColumn =
      foreignKey.to ?? referencedTable.primaryKeyColumns[foreignKey.seq];
    const referencedColumnType =
      referencedColumn &&
      referencedTable.columnTypes.get(referencedColumn.toLowerCase());

    if (!referencedColumn || !referencedColumnType) {
      violations.push(
        `${table.name}.${foreignKey.from} references unknown column ${
          referencedTable.name
        }.${referencedColumn ?? '<primary key>'}`
      );
      continue;
    }

    const columnType = table.columnTypes.get(foreignKey.from.toLowerCase());

    if (columnType !== referencedColumnType) {
      violations.push(
        `${table.name}.${foreignKey.from} is declared ${columnType} but references ${referencedTable.name}.${referencedColumn}, which is declared ${referencedColumnType}`
      );
    }
  }

  return violations;
}

/**
 * Finds all the ways `client`'s schema fails our conventions:
 *
 * - every table must be declared `strict`, so that sqlite enforces the declared
 *   column types rather than silently applying type affinity
 * - every foreign key column must be declared with the same type as the column
 *   it references
 *
 * Returns a message per violation, or an empty array if the schema is valid.
 */
export function findSchemaViolations(client: Client): string[] {
  const schemasByTableName = readTableSchemas(client);
  const violations: string[] = [];

  for (const table of schemasByTableName.values()) {
    if (!table.isStrict) {
      violations.push(`table ${table.name} is not declared strict`);
    }
  }

  for (const table of schemasByTableName.values()) {
    violations.push(
      ...findForeignKeyViolations(client, table, schemasByTableName)
    );
  }

  return violations;
}

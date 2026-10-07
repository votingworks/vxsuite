import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';

loadEnvVarsFromDotenvFiles();

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('organizations', {
    id: { type: 'text', primaryKey: true },
    name: { type: 'text', notNull: true, unique: true },
  });

  pgm.addConstraint('elections', null, {
    foreignKeys: {
      columns: 'org_id',
      references: 'organizations',
      onDelete: 'CASCADE',
    },
  });
}

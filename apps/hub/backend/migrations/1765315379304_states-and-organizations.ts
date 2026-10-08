import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  // Add states enum
  pgm.createType('state_code', ['DEMO', 'MS', 'NH']);

  // Add organizations (containers of jurisdictions)
  pgm.createTable('organizations', {
    id: { type: 'text', primaryKey: true },
    name: { type: 'text', notNull: true, unique: true },
  });

  // Each jurisdiction belongs to an organization and a state
  pgm.addColumn('jurisdictions', {
    organization_id: {
      type: 'text',
      references: 'organizations',
      notNull: true,
    },
    state_code: { type: 'state_code', notNull: true },
  });

  // Users also belong to organizations
  pgm.addColumn('users', {
    organization_id: {
      type: 'text',
      references: 'organizations',
      notNull: true,
    },
  });
}

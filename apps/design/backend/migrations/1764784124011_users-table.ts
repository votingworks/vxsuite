import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';

loadEnvVarsFromDotenvFiles();

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  // Copy Auth0 users into a local database table so that we can manage user-organization
  // relationships locally (rather than storing them in Auth0).
  pgm.createTable('users', {
    id: { type: 'text', primaryKey: true },
    name: { type: 'text', notNull: true },
  });
  pgm.createTable(
    'users_organizations',
    {
      user_id: {
        type: 'text',
        notNull: true,
        references: 'users',
        onDelete: 'CASCADE',
      },
      organization_id: {
        type: 'text',
        notNull: true,
        references: 'organizations',
        onDelete: 'CASCADE',
      },
    },
    {
      constraints: {
        primaryKey: ['user_id', 'organization_id'],
      },
    }
  );
}

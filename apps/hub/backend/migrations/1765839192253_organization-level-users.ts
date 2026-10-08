import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';

loadEnvVarsFromDotenvFiles();

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Loaded via dynamic import: the built globals module is ESM, and this
  // migration is CommonJS (node-pg-migrate loads migrations with require).
  const { sliOrganizationId, votingWorksOrganizationId } =
    await import('../build/globals.js');
  pgm.createType('user_type', ['organization_user', 'jurisdiction_user']);
  pgm.addColumn('users', {
    type: { type: 'user_type' },
  });

  pgm.sql(`
    UPDATE users
    SET type = 'organization_user'
    WHERE organization_id IN ('${votingWorksOrganizationId()}', '${sliOrganizationId()}');
  `);
  pgm.sql(`
    UPDATE users
    SET type = 'jurisdiction_user'
    WHERE type IS NULL;
  `);
  pgm.sql(`
    DELETE FROM users_jurisdictions
    WHERE user_id IN (
      SELECT id FROM users
      WHERE type = 'organization_user'
    );
  `);

  pgm.alterColumn('users', 'type', { notNull: true });
}

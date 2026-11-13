import assert from 'node:assert';
import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';

loadEnvVarsFromDotenvFiles();

export const shorthands: ColumnDefinitions | undefined = undefined;

function organizationId(envVarName: string, devFallback: string): string {
  const envVar = process.env[envVarName];
  if (envVar) {
    return envVar;
  }
  assert(
    process.env.NODE_ENV !== 'production',
    `Env var ${envVarName} required in production.`
  );
  return devFallback;
}

export function up(pgm: MigrationBuilder): void {
  const votingWorksOrganizationId = organizationId(
    'ORG_ID_VOTINGWORKS',
    'votingworks'
  );
  const sliOrganizationId = organizationId('ORG_ID_SLI', 'sli');
  pgm.createType('user_type', ['organization_user', 'jurisdiction_user']);
  pgm.addColumn('users', {
    type: { type: 'user_type' },
  });

  pgm.sql(`
    UPDATE users
    SET type = 'organization_user'
    WHERE organization_id IN ('${votingWorksOrganizationId}', '${sliOrganizationId}');
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

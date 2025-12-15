/* eslint-disable @typescript-eslint/no-var-requires */
const { loadEnvVarsFromDotenvFiles } = require('@votingworks/backend');
const {
  sliOrganizationId,
  votingWorksOrganizationId,
} = require('../build/globals');

loadEnvVarsFromDotenvFiles();

/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
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
};

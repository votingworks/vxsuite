/* eslint-disable @typescript-eslint/no-var-requires */
const { loadEnvVarsFromDotenvFiles } = require('@votingworks/backend');

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
};

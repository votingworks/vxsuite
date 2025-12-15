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
};

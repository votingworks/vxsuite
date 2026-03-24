/* eslint-disable @typescript-eslint/no-var-requires */

exports.shorthands =
  /** @type {import('node-pg-migrate').ColumnDefinitions | undefined} */ (
    undefined
  );

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = async (pgm) => {
  const { loadEnvVarsFromDotenvFiles } = await import('@votingworks/backend');
  loadEnvVarsFromDotenvFiles();
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

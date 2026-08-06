// NodeJS can `require` an ES module as of v20.19, but tsc still rejects it.
// @ts-expect-error - require of an ESM package
const { loadEnvVarsFromDotenvFiles } = require('@votingworks/backend');

loadEnvVarsFromDotenvFiles();

exports.shorthands =
  /** @type {import('node-pg-migrate').ColumnDefinitions | undefined} */ (
    undefined
  );

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void>}
 */
exports.up = async (pgm) => {
  // Loaded via dynamic import: the built globals module is ESM, and this
  // migration is CommonJS (node-pg-migrate loads migrations with require).
  const { sliOrganizationId, votingWorksOrganizationId } = await import(
    '../build/globals.js'
  );
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

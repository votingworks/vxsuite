exports.shorthands =
  /** @type {import('node-pg-migrate').ColumnDefinitions | undefined} */ (
    undefined
  );

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
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
};

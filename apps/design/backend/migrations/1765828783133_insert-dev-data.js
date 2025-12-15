/* eslint-disable @typescript-eslint/no-var-requires */
const { votingWorksOrganizationId } = require('../build/globals');

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
  // Seed the database with the dev data needed to bypass Auth0 in development
  // when AUTH_ENABLED=false (using the hardcoded dev user).
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.NODE_ENV !== 'test'
  ) {
    // Create the default dev organization (use VotingWorks org ID to get full features)
    pgm.sql(`
      INSERT INTO organizations (id, name) VALUES (
        '${votingWorksOrganizationId()}',
        'VotingWorks'
      );
    `);
    // Create the default dev user
    pgm.sql(`
      INSERT INTO users (id, name, organization_id) VALUES (
        'auth0|devuser',
        'Dev User',
        '${votingWorksOrganizationId()}'
      );
    `);
    // Create a default dev jurisdiction
    pgm.sql(`
      INSERT INTO jurisdictions (id, name, organization_id, state_code) VALUES (
        'dev-jurisdiction',
        'Dev Jurisdiction',
        '${votingWorksOrganizationId()}',
        'DEMO'
      );
    `);
    // Assign the dev user to the dev jurisdiction
    pgm.sql(`
      INSERT INTO users_jurisdictions (user_id, jurisdiction_id) VALUES (
        'auth0|devuser',
        'dev-jurisdiction'
      );
    `);
  }
};

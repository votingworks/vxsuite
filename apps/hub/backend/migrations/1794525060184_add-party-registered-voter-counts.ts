import type { MigrationBuilder } from 'node-pg-migrate';

const NONPARTISAN_COMMENT = 'NULL means nonpartisan';

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('precinct_party_registered_voter_counts', {
    precinct_id: {
      type: 'text',
      notNull: true,
      references: 'precincts(id)',
      onDelete: 'CASCADE',
    },
    party_id: {
      type: 'text',
      references: 'parties(id)',
      onDelete: 'CASCADE',
      comment: NONPARTISAN_COMMENT,
    },
    count: { type: 'integer', notNull: true },
  });
  pgm.addConstraint(
    'precinct_party_registered_voter_counts',
    'precinct_party_registered_voter_counts_unique',
    'unique nulls not distinct (precinct_id, party_id)'
  );

  pgm.createTable('precinct_split_party_registered_voter_counts', {
    split_id: {
      type: 'text',
      notNull: true,
      references: 'precinct_splits(id)',
      onDelete: 'CASCADE',
    },
    party_id: {
      type: 'text',
      references: 'parties(id)',
      onDelete: 'CASCADE',
      comment: NONPARTISAN_COMMENT,
    },
    count: { type: 'integer', notNull: true },
  });
  pgm.addConstraint(
    'precinct_split_party_registered_voter_counts',
    'precinct_split_party_registered_voter_counts_unique',
    'unique nulls not distinct (split_id, party_id)'
  );
}

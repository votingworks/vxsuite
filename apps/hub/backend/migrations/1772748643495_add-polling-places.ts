import { type MigrationBuilder, PgLiteral } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  const enumPollingPlaceType = 'polling_place_type';
  pgm.createType(enumPollingPlaceType, [
    'absentee',
    'early_voting',
    'election_day',
  ]);

  pgm.createTable(
    'polling_places',
    {
      id: { type: 'text', primaryKey: true },
      created_at: {
        type: 'timestamptz',
        notNull: true,
        default: new PgLiteral('current_timestamp'),
      },
      election_id: {
        type: 'text',
        notNull: true,
        references: 'elections',
        onDelete: 'CASCADE',
      },
      name: { type: 'text', notNull: true },
      type: { type: enumPollingPlaceType, notNull: true },
    },
    {
      constraints: {
        unique: ['election_id', 'name', 'type'],
      },
    }
  );

  pgm.createTable(
    'polling_places_precincts',
    {
      polling_place_id: {
        type: 'text',
        notNull: true,
        references: 'polling_places',
        onDelete: 'CASCADE',
      },
      precinct_id: {
        type: 'text',
        notNull: true,
        references: 'precincts',
        onDelete: 'CASCADE',
      },
    },
    {
      constraints: {
        primaryKey: ['polling_place_id', 'precinct_id'],
      },
    }
  );
}

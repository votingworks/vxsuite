/* eslint-disable @typescript-eslint/no-var-requires */
const { throwIllegalValue } = require('@votingworks/basics');
const { hasSplits } = require('@votingworks/types');
const { PgLiteral } = require('node-pg-migrate');

/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = {
  id: { type: 'text', primaryKey: true },
  election_id: {
    type: 'text',
    notNull: true,
    references: 'elections',
    onDelete: 'CASCADE',
  },
  created_at: {
    type: 'timestamptz',
    notNull: true,
    default: new PgLiteral('current_timestamp'),
  },
};

/**
 * Migrate election JSON data into normalized tables. Steps:
 * 1. Add tables for each entity within an election/add columns to the elections
 *    table for election attributes
 * 2. Copy data from the election JSON into the new tables
 * 3. Drop the original JSON columns from the elections table
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void>}
 */
exports.up = async (pgm) => {
  /**
   * Step 1: Add new columns/tables
   */
  pgm.addColumns('elections', {
    type: { type: 'text' },
    title: { type: 'text' },
    date: { type: 'date' },
    jurisdiction: { type: 'text' },
    state: { type: 'text' },
    seal: { type: 'text' },
    ballot_paper_size: { type: 'text' },
  });
  pgm.createTable('districts', {
    id: 'id',
    election_id: 'election_id',
    name: { type: 'text', notNull: true },
    created_at: 'created_at',
  });
  pgm.createTable('precincts', {
    id: 'id',
    election_id: 'election_id',
    name: { type: 'text', notNull: true },
    created_at: 'created_at',
  });
  pgm.createTable('precinct_splits', {
    id: 'id',
    precinct_id: {
      type: 'text',
      notNull: true,
      references: 'precincts',
      onDelete: 'CASCADE',
    },
    name: { type: 'text', notNull: true },
    nh_options: { type: 'jsonb', notNull: true },
    created_at: 'created_at',
  });
  pgm.createTable(
    'districts_precincts',
    {
      district_id: {
        type: 'text',
        notNull: true,
        references: 'districts',
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
        primaryKey: ['district_id', 'precinct_id'],
      },
    }
  );
  pgm.createTable(
    'districts_precinct_splits',
    {
      district_id: {
        type: 'text',
        notNull: true,
        references: 'districts',
        onDelete: 'CASCADE',
      },
      precinct_split_id: {
        type: 'text',
        notNull: true,
        references: 'precinct_splits',
        onDelete: 'CASCADE',
      },
    },
    {
      constraints: {
        primaryKey: ['district_id', 'precinct_split_id'],
      },
    }
  );
  pgm.createTable('parties', {
    id: 'id',
    election_id: 'election_id',
    name: { type: 'text', notNull: true },
    full_name: { type: 'text', notNull: true },
    abbrev: { type: 'text', notNull: true },
    created_at: 'created_at',
  });
  pgm.createTable('contests', {
    id: 'id',
    election_id: 'election_id',
    title: { type: 'text', notNull: true },
    type: { type: 'text', notNull: true },
    district_id: {
      type: 'text',
      notNull: true,
      references: 'districts',
      // For now, delete contests if their district is deleted. In the future
      // we may want to support contests having their district temporarily
      // unset.
      onDelete: 'CASCADE',
    },

    // type: 'candidate'
    seats: { type: 'integer' },
    allow_write_ins: { type: 'boolean' },
    party_id: {
      type: 'text',
      references: 'parties',
      onDelete: 'SET NULL',
    },
    term_description: { type: 'text' },

    // type: 'yesno'
    description: { type: 'text' },
    yes_option_id: { type: 'text' },
    yes_option_label: { type: 'text' },
    no_option_id: { type: 'text' },
    no_option_label: { type: 'text' },

    ballot_order: { type: 'integer', notNull: true },
    created_at: 'created_at',
  });
  pgm.createTable('candidates', {
    id: 'id',
    contest_id: {
      type: 'text',
      notNull: true,
      references: 'contests',
      onDelete: 'CASCADE',
    },
    first_name: { type: 'text' },
    middle_name: { type: 'text' },
    last_name: { type: 'text' },
    created_at: 'created_at',
  });
  pgm.createTable(
    'candidates_parties',
    {
      candidate_id: {
        type: 'text',
        notNull: true,
        references: 'candidates',
        onDelete: 'CASCADE',
      },
      party_id: {
        type: 'text',
        notNull: true,
        references: 'parties',
        onDelete: 'CASCADE',
      },
    },
    {
      constraints: {
        primaryKey: ['candidate_id', 'party_id'],
      },
    }
  );

  /**
   * Step 2: Copy data from JSON to new tables
   * @param {string | undefined} str
   */
  function quote(str) {
    return `${str?.replaceAll("'", "''")}`;
  }
  const electionDatas = await pgm.db.select({
    text: 'SELECT election_data FROM elections',
  });
  for (const electionData of electionDatas) {
    /** @type import('@votingworks/types').Election */
    const election = JSON.parse(electionData.election_data);

    pgm.sql(`
      UPDATE elections
      SET
        type = '${election.type}',
        title = '${quote(election.title)}',
        date = '${election.date}',
        jurisdiction = '${quote(election.county.name)}',
        state = '${quote(election.state)}',
        seal = '${election.seal}',
        ballot_paper_size = '${election.ballotLayout.paperSize}'
      WHERE id = '${election.id}'
    `);

    for (const district of election.districts) {
      pgm.sql(`
        INSERT INTO districts (
          id,
          election_id,
          name
        )
        VALUES (
          '${district.id}',
          '${election.id}',
          '${quote(district.name)}'
        )
      `);
    }

    const [precinctData] = await pgm.db.select({
      text: 'SELECT precinct_data FROM elections WHERE id = $1',
      values: [election.id],
    });
    /** @type import('@votingworks/types').SplittablePrecinct[] */
    const precincts = JSON.parse(precinctData.precinct_data);
    for (const precinct of precincts) {
      pgm.sql(`
        INSERT INTO precincts (
          id,
          election_id,
          name
        )
        VALUES (
          '${precinct.id}',
          '${election.id}',
          '${quote(precinct.name)}'
        )
      `);
      if (hasSplits(precinct)) {
        for (const split of precinct.splits) {
          const { id: splitId, name, districtIds, ...nhOptions } = split;
          pgm.sql(`
            INSERT INTO precinct_splits (
              id,
              precinct_id,
              name,
              nh_options
            )
            VALUES (
              '${splitId}',
              '${precinct.id}',
              '${quote(name)}',
              '${quote(JSON.stringify(nhOptions))}'
            )
          `);
          for (const districtId of districtIds) {
            pgm.sql(`
              INSERT INTO districts_precinct_splits (
                district_id,
                precinct_split_id
              )
              VALUES (
                '${districtId}',
                '${splitId}'
              )
            `);
          }
        }
      } else {
        for (const districtId of precinct.districtIds) {
          pgm.sql(`
            INSERT INTO districts_precincts (
              district_id,
              precinct_id
            )
            VALUES (
              '${districtId}',
              '${precinct.id}'
            )
          `);
        }
      }
    }

    for (const party of election.parties) {
      pgm.sql(`
        INSERT INTO parties (
          id,
          election_id,
          name,
          full_name,
          abbrev
        )
        VALUES (
          '${party.id}',
          '${election.id}',
          '${quote(party.name)}',
          '${quote(party.fullName)}',
          '${quote(party.abbrev)}'
        )
      `);
    }

    for (const [i, contest] of election.contests.entries()) {
      switch (contest.type) {
        case 'candidate': {
          pgm.sql(`
            INSERT INTO contests (
              id,
              election_id,
              title,
              type,
              district_id,
              seats,
              allow_write_ins,
              party_id,
              term_description,
              ballot_order
            )
            VALUES (
              '${contest.id}',
              '${election.id}',
              '${quote(contest.title)}',
              '${contest.type}',
              '${contest.districtId}',
              ${contest.seats},
              ${contest.allowWriteIns},
              ${contest.partyId ? `'${contest.partyId}'` : 'NULL'},
              ${
                contest.termDescription
                  ? `'${quote(contest.termDescription)}'`
                  : 'NULL'
              },
              ${i + 1}
            )
          `);
          for (const candidate of contest.candidates) {
            let { firstName, middleName, lastName } = candidate;
            if (!(firstName || middleName || lastName)) {
              const [firstPart, ...middleParts] = candidate.name.split(' ');
              firstName = firstPart ?? '';
              lastName = middleParts.pop() ?? '';
              middleName = middleParts.join(' ');
            }
            pgm.sql(`
              INSERT INTO candidates (
                id,
                contest_id,
                first_name,
                middle_name,
                last_name
              )
              VALUES (
                '${candidate.id}',
                '${contest.id}',
                ${firstName ? `'${quote(firstName)}'` : 'NULL'},
                ${middleName ? `'${quote(middleName)}'` : 'NULL'},
                ${lastName ? `'${quote(lastName)}'` : 'NULL'}
              )
            `);
            if (candidate.partyIds) {
              for (const partyId of candidate.partyIds) {
                pgm.sql(`
                  INSERT INTO candidates_parties (
                    candidate_id,
                    party_id
                  )
                  VALUES (
                    '${candidate.id}',
                    '${partyId}'
                  )
                `);
              }
            }
          }
          break;
        }

        case 'yesno': {
          pgm.sql(`
            INSERT INTO contests (
              id,
              election_id,
              title,
              type,
              district_id,
              description,
              yes_option_id,
              yes_option_label,
              no_option_id,
              no_option_label,
              ballot_order
            )
            VALUES (
              '${contest.id}',
              '${election.id}',
              '${quote(contest.title)}',
              '${contest.type}',
              '${contest.districtId}',
              '${quote(contest.description)}',
              '${contest.yesOption.id}',
              '${quote(contest.yesOption.label)}',
              '${contest.noOption.id}',
              '${quote(contest.noOption.label)}',
              ${i + 1}
            )
          `);
          break;
        }

        default:
          throwIllegalValue(contest);
      }
    }
  }

  /**
   * Step 3: Drop JSON columns
   */
  pgm.dropColumns('elections', ['election_data', 'precinct_data']);
};

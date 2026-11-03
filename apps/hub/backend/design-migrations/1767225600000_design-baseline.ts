import type { MigrationBuilder } from 'node-pg-migrate';

const BASELINE_TABLES = [
  'background_tasks',
  'candidates',
  'candidates_parties',
  'contests',
  'districts',
  'districts_precinct_splits',
  'districts_precincts',
  'elections',
  'jurisdictions',
  'organizations',
  'parties',
  'polling_places',
  'polling_places_precincts',
  'precinct_registered_voter_counts',
  'precinct_split_registered_voter_counts',
  'precinct_splits',
  'precincts',
];

const BASELINE_SQL = `
CREATE COLLATION natural_sort (provider = icu, locale = 'en-u-kn-true');

CREATE TYPE election_external_source AS ENUM (
    'ms-sems'
);

CREATE TYPE polling_place_type AS ENUM (
    'absentee',
    'early_voting',
    'election_day'
);

CREATE TYPE state_code AS ENUM (
    'DEMO',
    'MS',
    'NH',
    'MI'
);

CREATE TABLE background_tasks (
    id text NOT NULL,
    task_name text NOT NULL,
    payload text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    error text,
    progress jsonb,
    interrupted_at timestamp without time zone
);

CREATE TABLE candidates (
    id text NOT NULL,
    contest_id text NOT NULL,
    first_name text,
    middle_name text,
    last_name text,
    ballot_order integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    designation text
);

CREATE SEQUENCE candidates_ballot_order_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE candidates_ballot_order_seq OWNED BY candidates.ballot_order;

CREATE TABLE candidates_parties (
    candidate_id text NOT NULL,
    party_id text NOT NULL
);

CREATE TABLE contests (
    id text NOT NULL,
    election_id text NOT NULL,
    title text NOT NULL,
    type text NOT NULL,
    district_id text NOT NULL,
    seats integer,
    allow_write_ins boolean,
    party_id text,
    term_description text,
    description text,
    yes_option_id text,
    yes_option_label text,
    no_option_id text,
    no_option_label text,
    ballot_order integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    additional_options jsonb
);

CREATE SEQUENCE contests_ballot_order_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE contests_ballot_order_seq OWNED BY contests.ballot_order;

CREATE TABLE districts (
    id text NOT NULL,
    election_id text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE districts_precinct_splits (
    district_id text NOT NULL,
    precinct_split_id text NOT NULL
);

CREATE TABLE districts_precincts (
    district_id text NOT NULL,
    precinct_id text NOT NULL
);

CREATE TABLE elections (
    id text NOT NULL,
    jurisdiction_id text NOT NULL,
    system_settings_data text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    election_package_task_id text,
    election_package_url text,
    ballot_template_id text NOT NULL,
    ballots_finalized_at timestamp with time zone,
    ballot_language_codes text[] DEFAULT ARRAY[]::text[],
    type text,
    title text,
    date date,
    jurisdiction_name text,
    state text,
    seal text,
    ballot_paper_size text,
    ballot_compact boolean DEFAULT false NOT NULL,
    signature jsonb,
    last_exported_ballot_hash text,
    last_exported_election_data text,
    jurisdiction_external_id text NOT NULL,
    external_source election_external_source,
    ballots_approved_at timestamp with time zone,
    official_ballots_url text,
    sample_ballots_url text,
    test_ballots_url text,
    is_mi_combined_ballot_primary boolean DEFAULT false NOT NULL
);

CREATE TABLE jurisdictions (
    id text NOT NULL,
    name text NOT NULL,
    organization_id text NOT NULL,
    state_code state_code NOT NULL
);

CREATE TABLE organizations (
    id text NOT NULL,
    name text NOT NULL
);

CREATE TABLE parties (
    id text NOT NULL,
    election_id text NOT NULL,
    name text NOT NULL,
    full_name text NOT NULL,
    abbrev text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE polling_places (
    id text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    election_id text NOT NULL,
    name text NOT NULL,
    type polling_place_type NOT NULL
);

CREATE TABLE polling_places_precincts (
    polling_place_id text NOT NULL,
    precinct_id text NOT NULL
);

CREATE TABLE precinct_registered_voter_counts (
    precinct_id text NOT NULL,
    count integer NOT NULL
);

CREATE TABLE precinct_split_registered_voter_counts (
    split_id text NOT NULL,
    count integer NOT NULL
);

CREATE TABLE precinct_splits (
    id text NOT NULL,
    precinct_id text NOT NULL,
    name text NOT NULL,
    nh_options jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE precincts (
    id text NOT NULL,
    election_id text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY candidates ALTER COLUMN ballot_order SET DEFAULT nextval('candidates_ballot_order_seq'::regclass);

ALTER TABLE ONLY contests ALTER COLUMN ballot_order SET DEFAULT nextval('contests_ballot_order_seq'::regclass);

ALTER TABLE ONLY background_tasks
    ADD CONSTRAINT background_tasks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY candidates
    ADD CONSTRAINT candidates_ballot_order_key UNIQUE (ballot_order);

ALTER TABLE ONLY candidates_parties
    ADD CONSTRAINT candidates_parties_pkey PRIMARY KEY (candidate_id, party_id);

ALTER TABLE ONLY candidates
    ADD CONSTRAINT candidates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY contests
    ADD CONSTRAINT contests_ballot_order_key UNIQUE (ballot_order);

ALTER TABLE ONLY contests
    ADD CONSTRAINT contests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY districts
    ADD CONSTRAINT districts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY districts_precinct_splits
    ADD CONSTRAINT districts_precinct_splits_pkey PRIMARY KEY (district_id, precinct_split_id);

ALTER TABLE ONLY districts_precincts
    ADD CONSTRAINT districts_precincts_pkey PRIMARY KEY (district_id, precinct_id);

ALTER TABLE ONLY elections
    ADD CONSTRAINT elections_pkey PRIMARY KEY (id);

ALTER TABLE ONLY jurisdictions
    ADD CONSTRAINT organizations_name_key UNIQUE (name);

ALTER TABLE ONLY organizations
    ADD CONSTRAINT organizations_name_key1 UNIQUE (name);

ALTER TABLE ONLY jurisdictions
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY organizations
    ADD CONSTRAINT organizations_pkey1 PRIMARY KEY (id);

ALTER TABLE ONLY parties
    ADD CONSTRAINT parties_pkey PRIMARY KEY (id);

ALTER TABLE ONLY polling_places
    ADD CONSTRAINT polling_places_pkey PRIMARY KEY (id);

ALTER TABLE ONLY polling_places_precincts
    ADD CONSTRAINT polling_places_precincts_pkey PRIMARY KEY (polling_place_id, precinct_id);

ALTER TABLE ONLY polling_places
    ADD CONSTRAINT polling_places_uniq_election_id_name_type UNIQUE (election_id, name, type);

ALTER TABLE ONLY precinct_registered_voter_counts
    ADD CONSTRAINT precinct_registered_voters_counts_pkey PRIMARY KEY (precinct_id);

ALTER TABLE ONLY precinct_split_registered_voter_counts
    ADD CONSTRAINT precinct_split_registered_voters_counts_pkey PRIMARY KEY (split_id);

ALTER TABLE ONLY precinct_splits
    ADD CONSTRAINT precinct_splits_pkey PRIMARY KEY (id);

ALTER TABLE ONLY precincts
    ADD CONSTRAINT precincts_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX candidates_unique_index ON candidates USING btree (contest_id, first_name, middle_name, last_name) NULLS NOT DISTINCT;

CREATE UNIQUE INDEX contests_unique_index ON contests USING btree (district_id, title, seats, term_description, party_id) NULLS NOT DISTINCT;

CREATE UNIQUE INDEX districts_election_id_name_unique_index ON districts USING btree (election_id, name);

CREATE UNIQUE INDEX elections_jurisdiction_id_title_date_unique_index ON elections USING btree (jurisdiction_id, title, date) WHERE (title <> ''::text);

CREATE UNIQUE INDEX parties_election_id_abbrev_unique_index ON parties USING btree (election_id, abbrev);

CREATE UNIQUE INDEX parties_election_id_full_name_unique_index ON parties USING btree (election_id, full_name);

CREATE UNIQUE INDEX parties_election_id_name_unique_index ON parties USING btree (election_id, name);

CREATE UNIQUE INDEX precinct_splits_precinct_id_name_unique_index ON precinct_splits USING btree (precinct_id, name);

CREATE UNIQUE INDEX precincts_election_id_name_unique_index ON precincts USING btree (election_id, name);

ALTER TABLE ONLY candidates
    ADD CONSTRAINT candidates_contest_id_fkey FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE;

ALTER TABLE ONLY candidates_parties
    ADD CONSTRAINT candidates_parties_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE;

ALTER TABLE ONLY candidates_parties
    ADD CONSTRAINT candidates_parties_party_id_fkey FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE;

ALTER TABLE ONLY contests
    ADD CONSTRAINT contests_district_id_fkey FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE CASCADE;

ALTER TABLE ONLY contests
    ADD CONSTRAINT contests_election_id_fkey FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE;

ALTER TABLE ONLY contests
    ADD CONSTRAINT contests_party_id_fkey FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE SET NULL;

ALTER TABLE ONLY districts
    ADD CONSTRAINT districts_election_id_fkey FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE;

ALTER TABLE ONLY districts_precinct_splits
    ADD CONSTRAINT districts_precinct_splits_district_id_fkey FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE CASCADE;

ALTER TABLE ONLY districts_precinct_splits
    ADD CONSTRAINT districts_precinct_splits_precinct_split_id_fkey FOREIGN KEY (precinct_split_id) REFERENCES precinct_splits(id) ON DELETE CASCADE;

ALTER TABLE ONLY districts_precincts
    ADD CONSTRAINT districts_precincts_district_id_fkey FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE CASCADE;

ALTER TABLE ONLY districts_precincts
    ADD CONSTRAINT districts_precincts_precinct_id_fkey FOREIGN KEY (precinct_id) REFERENCES precincts(id) ON DELETE CASCADE;

ALTER TABLE ONLY elections
    ADD CONSTRAINT elections_jurisdiction_id_fkey FOREIGN KEY (jurisdiction_id) REFERENCES jurisdictions(id) ON DELETE CASCADE;

ALTER TABLE ONLY elections
    ADD CONSTRAINT fk_background_tasks FOREIGN KEY (election_package_task_id) REFERENCES background_tasks(id) ON DELETE SET NULL;

ALTER TABLE ONLY jurisdictions
    ADD CONSTRAINT jurisdictions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ONLY parties
    ADD CONSTRAINT parties_election_id_fkey FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE;

ALTER TABLE ONLY polling_places
    ADD CONSTRAINT polling_places_election_id_fkey FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE;

ALTER TABLE ONLY polling_places_precincts
    ADD CONSTRAINT polling_places_precincts_polling_place_id_fkey FOREIGN KEY (polling_place_id) REFERENCES polling_places(id) ON DELETE CASCADE;

ALTER TABLE ONLY polling_places_precincts
    ADD CONSTRAINT polling_places_precincts_precinct_id_fkey FOREIGN KEY (precinct_id) REFERENCES precincts(id) ON DELETE CASCADE;

ALTER TABLE ONLY precinct_registered_voter_counts
    ADD CONSTRAINT precinct_registered_voters_counts_precinct_id_fkey FOREIGN KEY (precinct_id) REFERENCES precincts(id) ON DELETE CASCADE;

ALTER TABLE ONLY precinct_split_registered_voter_counts
    ADD CONSTRAINT precinct_split_registered_voters_counts_split_id_fkey FOREIGN KEY (split_id) REFERENCES precinct_splits(id) ON DELETE CASCADE;

ALTER TABLE ONLY precinct_splits
    ADD CONSTRAINT precinct_splits_precinct_id_fkey FOREIGN KEY (precinct_id) REFERENCES precincts(id) ON DELETE CASCADE;

ALTER TABLE ONLY precincts
    ADD CONSTRAINT precincts_election_id_fkey FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE;
`;

export async function up(pgm: MigrationBuilder): Promise<void> {
  const { rows } = await pgm.db.query(
    `select count(*)::int as count from information_schema.tables
     where table_schema = current_schema() and table_name = any($1)`,
    [BASELINE_TABLES]
  );
  const existingTableCount: number = rows[0].count;
  if (existingTableCount === BASELINE_TABLES.length) {
    return;
  }
  if (existingTableCount !== 0) {
    throw new Error(
      `Found ${existingTableCount} of ${BASELINE_TABLES.length} design baseline tables; refusing to adopt a partial schema`
    );
  }
  pgm.sql(BASELINE_SQL);
}

export function down(): void {
  throw new Error('The design baseline migration cannot be undone');
}

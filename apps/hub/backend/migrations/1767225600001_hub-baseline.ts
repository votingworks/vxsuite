import type { MigrationBuilder } from 'node-pg-migrate';

const BASELINE_TABLES = [
  'export_qa_runs',
  'results_report_tallies',
  'results_reports',
  'results_reports_partial',
  'speech_synthesis_cache',
  'translation_cache',
  'tts_edits',
  'users',
  'users_jurisdictions',
];

const BASELINE_SQL = `
CREATE TYPE software_version AS ENUM (
    'v4.0',
    'v4.1'
);

CREATE TYPE user_type AS ENUM (
    'organization_user',
    'jurisdiction_user',
    'support_user'
);

ALTER TABLE elections ADD COLUMN test_decks_task_id text;

ALTER TABLE elections ADD COLUMN test_decks_url text;

ALTER TABLE jurisdictions ADD COLUMN software_version software_version NOT NULL;

CREATE TABLE export_qa_runs (
    id text NOT NULL,
    election_id text NOT NULL,
    export_package_url text NOT NULL,
    circleci_pipeline_id text,
    circleci_workflow_id text,
    status text DEFAULT '''pending'''::text NOT NULL,
    status_message text,
    results_url text,
    job_url text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE results_report_tallies (
    ballot_hash text NOT NULL,
    election_id text NOT NULL,
    machine_id text NOT NULL,
    is_live_mode boolean NOT NULL,
    polling_place_id text NOT NULL,
    precinct_id text NOT NULL,
    encoded_compressed_tally text NOT NULL,
    signed_at timestamp with time zone NOT NULL
);

CREATE TABLE results_reports (
    machine_id text NOT NULL,
    election_id text NOT NULL,
    ballot_hash text NOT NULL,
    is_live_mode boolean NOT NULL,
    signed_at timestamp with time zone NOT NULL,
    polls_transition text NOT NULL,
    polling_place_id text NOT NULL
);

CREATE TABLE results_reports_partial (
    machine_id text NOT NULL,
    election_id text NOT NULL,
    ballot_hash text NOT NULL,
    is_live_mode boolean NOT NULL,
    signed_at timestamp with time zone NOT NULL,
    encoded_compressed_tally text NOT NULL,
    polls_transition text NOT NULL,
    page_index integer NOT NULL,
    num_pages integer NOT NULL,
    polling_place_id text NOT NULL
);

CREATE TABLE speech_synthesis_cache (
    language_code text NOT NULL,
    source_text text NOT NULL,
    audio_clip_base64 text NOT NULL
);

CREATE TABLE translation_cache (
    source_text text NOT NULL,
    target_language_code text NOT NULL,
    translated_text text NOT NULL
);

CREATE TABLE tts_edits (
    jurisdiction_id text NOT NULL,
    language_code text NOT NULL,
    original text NOT NULL,
    export_source text DEFAULT 'text'::text NOT NULL,
    phonetic jsonb NOT NULL,
    text text NOT NULL,
    CONSTRAINT tts_edits_export_source_check CHECK ((export_source = ANY (ARRAY['phonetic'::text, 'text'::text])))
);

CREATE TABLE users (
    id text NOT NULL,
    name text NOT NULL,
    organization_id text NOT NULL,
    type user_type NOT NULL
);

CREATE TABLE users_jurisdictions (
    user_id text NOT NULL,
    jurisdiction_id text NOT NULL
);

ALTER TABLE ONLY export_qa_runs
    ADD CONSTRAINT export_qa_runs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY results_report_tallies
    ADD CONSTRAINT results_report_tallies_pkey PRIMARY KEY (ballot_hash, machine_id, is_live_mode, precinct_id);

ALTER TABLE ONLY results_reports_partial
    ADD CONSTRAINT results_reports_partial_pkey PRIMARY KEY (ballot_hash, machine_id, is_live_mode, polls_transition, page_index);

ALTER TABLE ONLY results_reports
    ADD CONSTRAINT results_reports_pkey PRIMARY KEY (ballot_hash, machine_id, is_live_mode, polls_transition);

ALTER TABLE ONLY speech_synthesis_cache
    ADD CONSTRAINT speech_synthesis_cache_pkey PRIMARY KEY (language_code, source_text);

ALTER TABLE ONLY translation_cache
    ADD CONSTRAINT translation_cache_pkey PRIMARY KEY (target_language_code, source_text);

ALTER TABLE ONLY tts_edits
    ADD CONSTRAINT tts_edits_pkey PRIMARY KEY (jurisdiction_id, language_code, original);

ALTER TABLE ONLY users_jurisdictions
    ADD CONSTRAINT users_organizations_pkey PRIMARY KEY (user_id, jurisdiction_id);

ALTER TABLE ONLY users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

CREATE INDEX export_qa_runs_election_id_index ON export_qa_runs USING btree (election_id);

ALTER TABLE ONLY export_qa_runs
    ADD CONSTRAINT export_qa_runs_election_id_fkey FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE;

ALTER TABLE ONLY elections
    ADD CONSTRAINT fk_test_decks_background_tasks FOREIGN KEY (test_decks_task_id) REFERENCES background_tasks(id) ON DELETE SET NULL;

ALTER TABLE ONLY tts_edits
    ADD CONSTRAINT tts_edits_jurisdiction_id_fkey FOREIGN KEY (jurisdiction_id) REFERENCES jurisdictions(id) ON DELETE CASCADE;

ALTER TABLE ONLY users_jurisdictions
    ADD CONSTRAINT users_jurisdictions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY users
    ADD CONSTRAINT users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ONLY users_jurisdictions
    ADD CONSTRAINT users_organizations_organization_id_fkey FOREIGN KEY (jurisdiction_id) REFERENCES jurisdictions(id) ON DELETE CASCADE;

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
      `Found ${existingTableCount} of ${BASELINE_TABLES.length} hub baseline tables; refusing to adopt a partial schema`
    );
  }
  pgm.sql(BASELINE_SQL);
}

export function down(): void {
  throw new Error('The hub baseline migration cannot be undone');
}

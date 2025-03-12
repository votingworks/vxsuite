create table background_tasks (
  id text primary key,
  task_name text not null,
  payload text not null,
  created_at timestamp not null default current_timestamp,
  started_at timestamp,
  completed_at timestamp,
  error text
);

create table elections (
  id text primary key,
  org_id text not null,
  election_data text not null,
  system_settings_data text not null,
  ballot_order_info_data text not null,
  precinct_data text not null,
  created_at timestamp not null default current_timestamp,
  election_package_task_id text
    constraint fk_background_tasks references background_tasks(id) on delete set null,
  election_package_url text,
  test_decks_task_id text
    constraint fk_test_decks_background_tasks references background_tasks(id) on delete set null,
  test_decks_url text,
  ballot_template_id text not null,
  ballots_finalized_at timestamptz,
  ballot_language_codes text[]
);

create table translation_cache (
  source_text text not null,
  target_language_code text not null,
  translated_text text not null,
  primary key (target_language_code, source_text)
);

create table speech_synthesis_cache (
  language_code text not null,
  source_text text not null,
  audio_clip_base64 text not null,
  primary key (language_code, source_text)
);

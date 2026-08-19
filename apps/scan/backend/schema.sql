create table election (
  -- enforce singleton table
  id integer primary key check (id = 1),
  election_data text not null,
  election_package_hash text not null,
  jurisdiction text not null,
  polling_place_id text,
  is_test_mode integer not null default true,
  ballot_casting_mode text not null default 'election_day',
  polls_state text not null default 'polls_closed_initial',
  last_polls_transition_type text,
  last_polls_transition_time integer,
  last_polls_transition_ballot_count integer,
  is_sound_muted integer not null default false,
  is_double_feed_detection_disabled integer not null default false,
  is_continuous_export_enabled integer not null default true,
  created_at text not null default current_timestamp,
  ballot_audit_id_secret_key text
) strict;

create table batches (
  batch_number integer primary key autoincrement,
  id text unique,
  label text,
  started_at text default current_timestamp not null,
  ended_at text,
  ballot_casting_mode text,
  polling_place_id text not null,
  error text
) strict;

create table sheets (
  id text primary key,
  batch_id text,

  -- Paths for the sheet images.
  front_image_path text unique,
  back_image_path text unique,

  -- Original interpretation of the sheet. These values should never be updated.
  -- @type {PageInterpretation}
  front_interpretation_json text not null,
  back_interpretation_json text not null,

  created_at text default current_timestamp not null,
  rejected_at text,

  foreign key (batch_id)
  references batches (id)
    on update cascade
    on delete cascade
) strict;

-- Supports counting ballots and batch sheet counts without reading full sheet
-- rows, which would require decoding past the large interpretation JSON blobs.
create index idx_sheets_unrejected on sheets (batch_id)
  where rejected_at is null;

create table system_settings (
  -- Enforce singleton table
  id integer primary key check (id = 1),
  data text not null -- JSON blob
) strict;

create table diagnostics (
  id integer primary key,
  type text not null,
  outcome text not null check (outcome = 'pass' or outcome = 'fail'),
  message text,
  timestamp integer not null
) strict;

create table export_directory_name (
  -- Enforce singleton table
  id integer primary key check (id = 1),
  export_directory_name text not null
) strict;

create table pending_continuous_export_operations (
  sheet_id text primary key check (length(sheet_id) = 36)
) strict;

create table cvr_hashes (
  cvr_id_level_1_prefix text not null check (
    length(cvr_id_level_1_prefix) = 1 or
    length(cvr_id_level_1_prefix) = 0
  ),
  cvr_id_level_2_prefix text not null check (
    length(cvr_id_level_2_prefix) = 2 or
    length(cvr_id_level_2_prefix) = 0
  ),
  cvr_id text not null check (
    length(cvr_id) = 36 or
    length(cvr_id) = 0
  ),
  cvr_hash text not null check (
    length(cvr_hash) = 64
  )
) strict;

create unique index idx_cvr_hashes on cvr_hashes (
  cvr_id_level_1_prefix,
  cvr_id_level_2_prefix,
  cvr_id
);

create table languages (
  code text primary key
) strict;

create table ui_strings (
  language_code text primary key,
  data text not null, -- JSON blob - see libs/types/UiStringTranslationsSchema
  foreign key (language_code) references languages(code)
) strict;

create table audio_clips (
  id text not null,
  language_code text not null,
  data_base64 text not null, -- Base64-encoded audio bytes
  primary key (language_code, id),
  foreign key (language_code) references languages(code)
) strict;

create table ui_string_audio_ids (
  language_code text primary key,
  data text not null, -- JSON blob - see libs/types/UiStringAudioIdsSchema
  foreign key (language_code) references languages(code)
) strict;

create table electrical_testing_status_messages (
  component text primary key,
  status_message text not null,
  updated_at text default current_timestamp not null
) strict;

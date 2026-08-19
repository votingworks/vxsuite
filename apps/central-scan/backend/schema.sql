create table election (
  -- enforce singleton table
  id integer primary key check (id = 1),
  election_data text not null,
  election_package_hash text not null,
  jurisdiction text not null,
  is_test_mode integer not null default true,
  polls_state text not null default 'polls_closed_initial',
  is_sound_muted integer not null default false,
  polling_place_id text,
  scanner_backed_up_at text,
  created_at text not null default current_timestamp
) strict;

create table batches (
  batch_number integer primary key autoincrement,
  id text unique,
  label text,
  polling_place_id text not null,
  started_at text default current_timestamp not null,
  ended_at text,
  deleted_at text,
  error text
) strict;

create table sheets (
  id text primary key,
  batch_id text,
  ballot_audit_id text, -- <batch_id>_<4-digit-sequence>

  -- Paths for the sheet images.
  front_image_path text unique,
  back_image_path text unique,

  -- Original interpretation of the sheet. These values should never be updated.
  -- @type {PageInterpretation}
  front_interpretation_json text not null,
  back_interpretation_json text not null,

  -- Did this sheet require adjudication? This value should never be updated.
  requires_adjudication integer,

  -- When adjudication is finished, this value is updated to now.
  finished_adjudication_at text,

  created_at text default current_timestamp not null,
  deleted_at text,

  foreign key (batch_id)
  references batches (id)
    on update cascade
    on delete cascade
) strict;

create table system_settings (
  -- enforce singleton table
  id integer primary key check (id = 1),
  data text not null -- JSON blob
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

create table diagnostics (
  id integer primary key,
  type text not null,
  outcome text not null check (outcome = 'pass' or outcome = 'fail'),
  message text,
  timestamp integer not null
) strict;

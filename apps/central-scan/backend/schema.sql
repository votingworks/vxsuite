create table election (
  -- enforce singleton table
  id integer primary key check (id = 1),
  election_data text not null,
  jurisdiction text not null,
  precinct_selection text,
  is_test_mode boolean not null default true,
  polls_state text not null default "polls_closed_initial",
  ballot_count_when_ballot_bag_last_replaced integer not null default 0,
  is_sound_muted boolean not null default false,
  scanner_backed_up_at datetime,
  created_at timestamp not null default current_timestamp
);

create table batches (
  batch_number integer primary key autoincrement,
  id varchar(36) unique,
  label text,
  started_at datetime default current_timestamp not null,
  ended_at datetime,
  deleted_at datetime,
  error varchar(4000)
);

create table sheets (
  id varchar(36) primary key,
  batch_id varchar(36),

  -- Paths for the sheet images.
  front_image_path text unique,
  back_image_path text unique,

  -- Original interpretation of the sheet. These values should never be updated.
  -- @type {PageInterpretation}
  front_interpretation_json text not null,
  back_interpretation_json text not null,

  -- Did this sheet require adjudication? This value should never be updated.
  requires_adjudication boolean,

  -- When adjudication is finished, this value is updated to now.
  finished_adjudication_at datetime,

  created_at datetime default current_timestamp not null,
  deleted_at datetime,

  foreign key (batch_id)
  references batches (id)
    on update cascade
    on delete cascade
);

create table system_settings (
  -- enforce singleton table
  id integer primary key check (id = 1),
  data text not null -- JSON blob
);

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
);

create unique index idx_cvr_hashes on cvr_hashes (
  cvr_id_level_1_prefix,
  cvr_id_level_2_prefix,
  cvr_id
);

create table system_information (
  -- enforce singleton table
  id integer primary key check (id = 1),
  maximum_usable_disk_space integer not null default 1
);

insert into system_information default values;

create table diagnostics (
  id integer primary key,
  type text not null,
  outcome text not null check (outcome = 'pass' or outcome = 'fail'),
  message text,
  timestamp number not null
);  

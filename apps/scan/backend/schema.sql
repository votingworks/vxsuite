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
  is_ultrasonic_disabled boolean not null default false,
  marginal_mark_threshold_override real,
  definite_mark_threshold_override real,
  cvrs_backed_up_at datetime,
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

  -- Filenames for where the sheet images are stored on disk.
  front_normalized_filename text unique,
  back_normalized_filename text unique,

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
  are_poll_worker_card_pins_enabled boolean not null,
  inactive_session_time_limit_minutes integer not null,
  num_incorrect_pin_attempts_allowed_before_card_lockout integer not null,
  overall_session_time_limit_hours integer not null,
  starting_card_lockout_duration_seconds integer not null
);

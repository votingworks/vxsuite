-- singleton table, i.e. there is only one row in the table
create table config (
  -- determines which election is the currently-active one, read-write
  current_election_id varchar(36),

  foreign key (current_election_id)
  references elections (id)
    on delete set null
);

-- configured elections, for switching between them at runtime
-- and preserving an archive of past elections for a time
create table elections (
  -- UUID for this election, read-only
  id varchar(36) primary key,
  -- raw election data, read-only
  definition_json text not null,
  -- sha256 hash of the raw election data, read-only
  election_hash varchar(64) not null,
  -- whether this election is in test or live mode, read-only
  test_mode boolean not null,
  -- overrides for the mark thresholds configured in `definition_json`, read-write
  mark_threshold_overrides_json text,
  -- the current precinct the scanner is configured for, read-write
  current_precinct_id varchar(36),
  -- when this record was created, read-only
  created_at datetime default current_timestamp not null
);

create table ballot_templates (
  -- UUID for this ballot template, read-only
  id varchar(36) primary key,
  -- UUID for the election this ballot template is for, read-only
  election_id varchar(36) not null,
  -- PDF data for this ballot template, read-only
  pdf blob,
  -- name of the interpreter this ballot template is for, read-only
  interpreter varchar(255) not null,
  -- when this record was created, read-only
  created_at datetime default current_timestamp not null,

  foreign key (election_id)
  references elections (id)
    on update cascade
    on delete cascade
);

create table ballot_sheet_templates (
  -- UUID for this ballot sheet template, read-only
  id varchar(36) primary key,
  ballot_template_id varchar(36),
  front_identifier text,
  back_identifier text,
  front_layout text,
  back_layout text,
  created_at datetime default current_timestamp not null,

  unique (front_identifier, back_identifier) on conflict fail,

  foreign key (ballot_template_id)
  references ballot_templates (id)
    on update cascade
    on delete cascade
);

create table scan_batches (
  -- UUID for this scan batch, read-only
  id varchar(36) primary key,
  -- election UUID this batch was scanned into, read-only
  election_id varchar(36) not null,
  -- ordinal number of this batch within its election, read-only
  batch_number integer not null,
  -- a human-readable label for this batch, read-only
  label text not null,
  -- when this record was created, read-only
  started_at datetime default current_timestamp not null,
  -- when this batch finished scanning, read-write
  ended_at datetime,
  deleted_at datetime,
  error varchar(4000),

  foreign key (election_id)
  references elections (id)
    on update cascade
    on delete cascade
);

create table scan_sheets (
  id varchar(36) primary key,
  batch_id varchar(36) not null,

  -- Filenames for where the sheet images are stored on disk.
  front_original_filename text unique,
  back_original_filename text unique,

  -- Interpretation of the sheet to use.
  selected_interpretation_id varchar(36),

  created_at datetime default current_timestamp not null,
  deleted_at datetime,

  foreign key (batch_id)
  references scan_batches (id)
    on update cascade
    on delete cascade

  foreign key (selected_interpretation_id)
  references scan_interpretations (id)
    on update cascade
    on delete set null
);

create table scan_adjudications (
  -- UUID for this adjudication, read-only
  id varchar(36) primary key,
  -- UUID for the sheet this adjudication is for, read-only
  sheet_id varchar(36) not null,
  -- true if the sheet should be accepted & false otherwise, read-write
  accepted boolean not null,
  -- when this record was created, read-only
  created_at datetime default current_timestamp not null,

  foreign key (sheet_id)
  references scan_sheets (id)
    on update cascade
    on delete cascade
);

create table scan_interpretations (
  id varchar(36) primary key,
  sheet_id varchar(36) not null,
  interpreter varchar(255) not null,

  -- Filenames for where the sheet images are stored on disk.
  front_original_filename text unique,
  back_original_filename text unique,
  front_normalized_filename text unique,
  back_normalized_filename text unique,

  -- Original interpretation of the sheet. These values should never be updated.
  -- @type {PageInterpretation}
  front_interpretation_json text not null,
  back_interpretation_json text not null,

  -- Did this sheet require adjudication? This value should never be updated.
  requires_adjudication boolean not null,

  created_at datetime default current_timestamp not null,

  foreign key (sheet_id)
  references scan_sheets (id)
    on update cascade
    on delete cascade
);

create table scan_sheet_exports (
  id varchar(36) primary key,
  sheet_id varchar(36) not null,

  -- @type {'castVoteRecord' | 'scanImages'}
  export_type varchar(255) not null,
  created_at datetime default current_timestamp not null,

  foreign key (sheet_id)
  references scan_sheets (id)
    on update cascade
    on delete cascade
);

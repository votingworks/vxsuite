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
  front_original_filename text unique,
  back_original_filename text unique,
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

create table backups (
  key varchar(255) unique,
  value datetime not null
);

create table configs (
  key varchar(255) unique,
  value text
);

create table hmpb_templates (
  id varchar(36) primary key,
  pdf blob not null,
  -- @type {BallotMetadata}
  metadata_json text not null,
  -- @type {BallotPageLayout[]}
  layouts_json text not null,
  created_at datetime default current_timestamp not null
);

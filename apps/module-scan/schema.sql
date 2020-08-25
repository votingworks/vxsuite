-- enforce foreign key constraints
pragma foreign_keys = 1;

create table batches (
  id varchar(36) primary key,
  started_at datetime default current_timestamp not null,
  ended_at datetime
);

create table ballots (
  id varchar(36) primary key,
  batch_id varchar(36),
  original_filename text unique,
  normalized_filename text unique,
  marks_json text,
  cvr_json text,
  metadata_json text,
  adjudication_json text,
  adjudication_info_json text,
  requires_adjudication boolean,
  created_at datetime default current_timestamp not null,

  foreign key (batch_id)
  references batches (id)
    on update cascade
    on delete cascade
);

create table configs (
  key varchar(255) unique,
  value text
);

create table hmpb_templates (
  id varchar(36) primary key,
  pdf blob,
  locales varchar(255),
  ballot_style_id varchar(255),
  precinct_id varchar(255),
  is_test_ballot boolean,
  layouts_json text,
  created_at datetime default current_timestamp not null
);

create unique index hmpb_templates_idx on hmpb_templates (
  locales,
  ballot_style_id,
  precinct_id,
  is_test_ballot
);

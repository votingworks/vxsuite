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

  -- Original interpretation of the page. This value should never be updated.
  -- @type {PageInterpretation}
  interpretation_json text not null,

  -- Changes made in adjudication, should be applied on top of the original CVR.
  -- Updated as the page is adjudicated.
  -- @type {MarksByContestId}
  adjudication_json text,

  -- Does this page _currently_ require adjudication? Updated as the page is
  -- adjudicated.
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

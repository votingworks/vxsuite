create table election (
  -- enforce singleton table
  id integer primary key check (id = 1),
  election_data text not null,
  election_package_hash text not null,
  jurisdiction text not null,
  precinct_selection text,
  is_test_mode boolean not null default true,
  polls_state text not null default "polls_closed_initial",
  ballots_printed_count integer not null default 0,
  print_mode text default "summary",
  created_at timestamp not null default current_timestamp
);

-- Temporary dev table:
create table print_calibration (
  -- enforce singleton table
  id integer primary key check (id = 1),
  offset_mm_x real not null,
  offset_mm_y real not null
);

create table system_settings (
  -- enforce singleton table
  id integer primary key check (id = 1),
  data text not null -- JSON blob
);

create table languages (
  code text primary key
);

create table ui_strings (
  language_code text primary key,
  data text not null, -- JSON blob - see libs/types/UiStringTranslationsSchema
  foreign key (language_code) references languages(code)
);

create table audio_clips (
  id text not null,
  language_code text not null,
  data_base64 text not null, -- Base64-encoded audio bytes
  primary key (language_code, id),
  foreign key (language_code) references languages(code)
);

create table ui_string_audio_ids (
  language_code text primary key,
  data text not null, -- JSON blob - see libs/types/UiStringAudioIdsSchema
  foreign key (language_code) references languages(code)
);

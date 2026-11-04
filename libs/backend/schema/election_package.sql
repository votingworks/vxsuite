-- Everything an election package imports, kept apart from the app's own
-- session state (polls, counts, batches, sheets). Written when a machine is
-- configured, read-only until it is unconfigured. One schema serves every app
-- that configures from an election package; an app leaves the tables it has
-- no use for empty.

create table election (
  -- enforce singleton table
  id integer primary key check (id = 1),
  election_data text not null,
  ballot_hash text not null,
  election_package_hash text not null,
  jurisdiction text not null
) strict;

create table system_settings (
  -- enforce singleton table
  id integer primary key check (id = 1),
  data text not null -- JSON blob
) strict;

create table ballot_positions (
  style_id text primary key,
  positions text not null -- JSON string of SheetPositions[]
) strict;

create table candidate_orderings (
  style_group_id text primary key,
  orderings text not null -- JSON string of CandidateOrderings
) strict;

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

-- Pre-rendered ballot PDFs (VxMark, VxPrint).
create table ballots (
  id integer primary key,
  ballot_style_id text not null,
  precinct_id text not null,
  ballot_type text not null,
  ballot_mode text not null,
  encoded_ballot text not null -- Base64 encoded ballot
) strict;

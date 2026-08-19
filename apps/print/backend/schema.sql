create table election (
  -- enforce singleton table
  id integer primary key check (id = 1),
  election_data text not null,
  election_package_hash text not null,
  jurisdiction text not null,
  created_at text not null default current_timestamp,
  polling_place_id text,
  is_test_mode integer not null default false
) strict;

create table system_settings (
  -- enforce singleton table
  id integer primary key check (id = 1),
  data text not null -- JSON blob
) strict;

create table ballots (
  id integer primary key,
  ballot_style_id text not null,
  precinct_id text not null,
  ballot_type text not null,
  ballot_mode text not null,
  encoded_ballot text not null, -- Base64 encoded ballot
  print_count integer not null default 0
) strict;

create table diagnostics (
  id integer primary key,
  type text not null,
  outcome text not null check (outcome = 'pass' or outcome = 'fail'),
  message text,
  timestamp integer not null
) strict;

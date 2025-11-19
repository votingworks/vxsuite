create table election (
  -- enforce singleton table
  id integer primary key check (id = 1),
  election_data text not null,
  election_package_hash text not null,
  jurisdiction text not null,
  created_at timestamp not null default current_timestamp,
  precinct_selection text
);

create table system_settings (
  -- enforce singleton table
  id integer primary key check (id = 1),
  data text not null -- JSON blob
);

create table ballots (
  id integer primary key,
  ballot_style_id text not null,
  precinct_id text not null,
  ballot_type text not null,
  ballot_mode text not null,
  encoded_ballot text not null, -- Base64 encoded ballot
  print_count integer not null default 0
);

create table elections (
  id integer primary key,
  election_data text not null,
  system_settings_data text not null,
  precinct_data text not null,
  created_at timestamp not null default current_timestamp
);
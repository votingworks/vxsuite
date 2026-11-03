-- The election itself lives in the election package DB (see
-- `ElectionPackageStore`); this row is the session state for it, and its
-- presence is what makes the machine configured.
create table election (
  -- enforce singleton table
  id integer primary key check (id = 1),
  created_at text not null default current_timestamp,
  polling_place_id text,
  is_test_mode integer not null default false
) strict;

create table ballot_print_counts (
  ballot_style_id text not null,
  precinct_id text not null,
  ballot_type text not null,
  ballot_mode text not null,
  count integer not null default 0,
  primary key (ballot_style_id, precinct_id, ballot_type, ballot_mode)
) strict;

create table diagnostics (
  id integer primary key,
  type text not null,
  outcome text not null check (outcome = 'pass' or outcome = 'fail'),
  message text,
  timestamp integer not null
) strict;

-- The election itself lives in the election package DB (see
-- `ElectionPackageStore`); this row is the session state for it, and its
-- presence is what makes the machine configured.
create table election (
  -- enforce singleton table
  id integer primary key check (id = 1),
  polling_place_id text,
  is_test_mode integer not null default true,
  polls_state text not null default 'polls_closed_initial',
  ballots_printed_count integer not null default 0,
  barcode_activation_mode text not null default 'voter_session'
    check (barcode_activation_mode in ('voter_session', 'ballot_printing')),
  created_at text not null default current_timestamp
) strict;

-- Temporary dev table:
create table print_calibration (
  -- enforce singleton table
  id integer primary key check (id = 1),
  offset_mm_x real not null,
  offset_mm_y real not null
) strict;

create table diagnostics (
  id integer primary key,
  type text not null,
  outcome text not null check (outcome = 'pass' or outcome = 'fail'),
  message text,
  timestamp integer not null
) strict;

create table electrical_testing_status_messages (
  component text primary key,
  status_message text not null,
  updated_at text default current_timestamp not null
) strict;

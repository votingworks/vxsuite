create table election (
  -- enforce singleton table
  id integer primary key check (id = 1),
  election_data text not null,
  precinct_selection text,
  is_test_mode boolean not null default true,
  skip_election_hash_check boolean not null default false,
  polls_state text not null default "polls_closed_initial",
  ballot_count_when_ballot_bag_last_replaced integer not null default 0,
  is_sound_muted boolean not null default false,
  marginal_mark_threshold_override real,
  definite_mark_threshold_override real,
  cvrs_backed_up_at datetime,
  scanner_backed_up_at datetime,
  created_at timestamp not null default current_timestamp
);

create table system_settings (
  -- enforce singleton table
  id integer primary key check (id = 1),
  are_poll_worker_card_pins_enabled boolean not null default false
);

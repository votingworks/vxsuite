create table election (
  -- enforce singleton table
  id integer primary key check (id = 1),
  election_data text not null,
  jurisdiction text not null,
  created_at timestamp not null default current_timestamp
);

create table system_settings (
  -- enforce singleton table
  id integer primary key check (id = 1),
  are_poll_worker_card_pins_enabled boolean not null,
  inactive_session_time_limit_minutes integer not null,
  num_incorrect_pin_attempts_allowed_before_card_lockout integer not null,
  overall_session_time_limit_hours integer not null,
  starting_card_lockout_duration_seconds integer not null
);

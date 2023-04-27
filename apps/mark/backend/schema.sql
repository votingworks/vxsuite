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
  are_poll_worker_card_pins_enabled boolean not null default false
);

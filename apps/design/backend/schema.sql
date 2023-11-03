create table elections (
  id integer primary key,
  election_data text not null,
  system_settings_data text not null,
  precinct_data text not null,
  layout_options_data text not null,
  created_at timestamp not null default current_timestamp
);

create table background_tasks (
  id text primary key,
  task_name text not null,
  payload text not null,
  created_at timestamp not null default current_timestamp,
  started_at timestamp,
  completed_at timestamp,
  error text
);

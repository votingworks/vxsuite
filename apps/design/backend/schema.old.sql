create table elections (
  id text primary key,
  election_data text not null,
  system_settings_data text not null,
  precinct_data text not null,
  created_at timestamp not null default current_timestamp,
  election_package_task_id text,
  election_package_url text,
  foreign key (election_package_task_id) references background_tasks(id)
    on delete set null
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

create table translation_cache (
  source_text text not null,
  target_language_code text not null,
  translated_text text not null
);

create unique index idx_translation_cache on translation_cache (
  source_text,
  target_language_code
);

create table speech_synthesis_cache (
  language_code text not null,
  source_text text not null,
  audio_clip_base64 text not null,
  primary key (language_code, source_text)
);

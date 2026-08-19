create table users (
  id text primary key,
  name text not null,
  email text not null,
  password_hash text not null,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
) strict;

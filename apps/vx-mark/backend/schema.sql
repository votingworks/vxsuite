create table elections (
  id integer primary key autoincrement,
  election_data text not null,
  election_hash text not null,
  created_at timestamp not null default current_timestamp
);

create table voters (
  id integer primary key,
  election_id text not null,
  ballot_style text not null
);
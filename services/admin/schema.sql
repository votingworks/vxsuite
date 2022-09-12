create table elections (
  id serial primary key,
  data text not null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp,
  deleted_at timestamp
);

create table adjudications (
  id varchar(36) primary key,
  contest_id text not null,
  transcribed_value text,
  cvr_id varchar(36) not null,
  foreign key (cvr_id) references cvrs(id)
    on update cascade
    on delete cascade
);

create table cvrs (
  id varchar(36) primary key,
  election_id varchar(36) not null,
  ballot_id varchar(36) not null,
  data text not null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp
);

create table cvr_files (
  id varchar(36) primary key,
  election_id varchar(36) not null,
  filename text not null,
  data text not null,
  sha256_hash text not null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp,
  foreign key (election_id) references elections(id)
    on update cascade
    on delete cascade
);

create table cvr_file_entries (
  cvr_file_id varchar(36) not null,
  cvr_id varchar(36) not null,
  primary key (cvr_file_id, cvr_id),
  foreign key (cvr_file_id) references cvr_files(id)
    on update cascade,
  foreign key (cvr_id) references cvrs(id)
    on update cascade
);

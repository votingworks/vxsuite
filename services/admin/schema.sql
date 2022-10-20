create table elections (
  id serial primary key,
  data text not null,
  is_official_results boolean not null default false,
  created_at timestamp not null default current_timestamp,
  deleted_at timestamp
);

create table write_in_adjudications (
  id varchar(36) primary key,
  election_id varchar(36) not null,
  contest_id text not null,
  transcribed_value text not null,
  adjudicated_value text not null,
  adjudicated_option_id text,
  created_at timestamp not null default current_timestamp,
  foreign key (election_id) references elections(id)
    on delete cascade,
  unique (election_id, contest_id, transcribed_value)
);

create table write_ins (
  id varchar(36) primary key,
  cvr_id varchar(36) not null,
  contest_id text not null,
  option_id text not null,
  transcribed_value text,
  transcribed_at timestamp,
  created_at timestamp not null default current_timestamp,
  foreign key (cvr_id) references cvrs(id)
    on delete cascade,
  unique (cvr_id, contest_id, option_id)
);

create table cvrs (
  id varchar(36) primary key,
  election_id varchar(36) not null,
  ballot_id varchar(36) not null,
  data text not null,
  created_at timestamp not null default current_timestamp,
  foreign key (election_id) references elections(id)
    on delete cascade
);

create table cvr_files (
  id varchar(36) primary key,
  election_id varchar(36) not null,
  filename text not null,
  sha256_hash text not null,
  created_at timestamp not null default current_timestamp,
  foreign key (election_id) references elections(id)
    on delete cascade
);

create table cvr_file_entries (
  cvr_file_id varchar(36) not null,
  cvr_id varchar(36) not null,
  primary key (cvr_file_id, cvr_id),
  foreign key (cvr_file_id) references cvr_files(id)
    on delete cascade,
  foreign key (cvr_id) references cvrs(id)
    on delete cascade
);

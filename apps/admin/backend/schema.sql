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
  side text not null check (side = 'front' or side = 'back'),
  contest_id text not null,
  option_id text not null,
  transcribed_value text,
  transcribed_at timestamp,
  created_at timestamp not null default current_timestamp,
  foreign key (cvr_id) references cvrs(id)
    on delete cascade,
  foreign key (cvr_id, side) references ballot_images(cvr_id, side),
  unique (cvr_id, contest_id, option_id)
);

create table cvrs (
  id varchar(36) primary key,
  election_id varchar(36) not null,
  ballot_id varchar(36) not null,
  ballot_style_id text not null,
  ballot_type text not null 
    check (ballot_type = 'absentee' or ballot_type = 'precinct' or ballot_type = 'provisional'),
  batch_id text not null,
  precinct_id text not null,
  sheet_number integer check (sheet_number is null or sheet_number > 0),
  votes text not null,
  created_at timestamp not null default current_timestamp,
  foreign key (election_id) references elections(id)
    on delete cascade,
  foreign key (batch_id) references scanner_batches(id)
);

create index idx_cvrs_election_id on cvrs(election_id);
create index idx_cvrs_ballot_id on cvrs(ballot_id);

create table scanner_batches (
  id text not null,
  label text not null,
  scanner_id text not null,
  election_id varchar(36) not null,
  primary key (id),
  foreign key (election_id) references elections(id)
    on delete cascade
);

create table cvr_files (
  id varchar(36) primary key,
  election_id varchar(36) not null,
  is_test_mode boolean not null,
  filename text not null,
  export_timestamp timestamp not null,
  precinct_ids text not null,
  scanner_ids text not null,
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

create table ballot_images (
  cvr_id varchar(36) not null,
  side text not null check (side = 'front' or side = 'back'),
  image blob not null,
  layout text not null,
  primary key (cvr_id, side),
  foreign key (cvr_id) references cvrs(id)
    on delete cascade
);

create table system_settings (
  -- enforce singleton table
  id integer primary key check (id = 1),
  are_poll_worker_card_pins_enabled boolean not null default false
);

create table settings (
  -- enforce singleton table
  id integer primary key check (id = 1),
  current_election_id varchar(36),
  foreign key (current_election_id) references elections(id)
);

insert into settings default values;

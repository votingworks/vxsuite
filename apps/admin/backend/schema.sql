create table elections (
  id serial primary key,
  election_data text not null,
  system_settings_data text not null,
  election_package_file_contents blob not null,
  is_official_results boolean not null default false,
  created_at timestamp not null default current_timestamp
);

create table precincts(
  election_id integer not null,
  id text not null,
  name text not null,
  primary key (election_id, id),
  foreign key (election_id) references elections(id)
    on delete cascade
);

create table ballot_styles (
  election_id integer not null,
  id text not null,
  party_id text,
  primary key (election_id, id),
  foreign key (election_id) references elections(id)
    on delete cascade
);

create table ballot_styles_to_precincts(
  election_id integer not null,
  ballot_style_id text not null,
  precinct_id text not null,
  primary key (election_id, ballot_style_id, precinct_id),
  foreign key (election_id, ballot_style_id) references ballot_styles(election_id, id)
    on delete cascade
  foreign key (election_id, precinct_id) references precincts(election_id, id)
    on delete cascade
);

create index idx_ballot_styles_to_precincts_precinct_id on 
  ballot_styles_to_precincts(election_id, precinct_id);

create table ballot_styles_to_districts(
  election_id text not null,
  ballot_style_id text not null,
  district_id text not null,
  primary key (election_id, ballot_style_id, district_id),
  foreign key (election_id, ballot_style_id) references ballot_styles(election_id, id)
    on delete cascade
);

create index idx_ballot_styles_to_districts_district_id on 
  ballot_styles_to_districts(election_id, district_id);

create table contests(
  election_id text not null,
  id text not null,
  district_id text not null,
  party_id text,
  sort_index integer not null,
  primary key (election_id, id),
  foreign key (election_id) references elections(id)
    on delete cascade
);

create table voting_methods(
  election_id integer not null,
  voting_method text not null 
    check (voting_method = 'absentee' or voting_method = 'precinct' or voting_method = 'provisional'),
  primary key (election_id, voting_method),
  foreign key (election_id) references elections(id)
    on delete cascade
);

create table write_in_candidates (
  id varchar(36) primary key,
  election_id varchar(36) not null,
  contest_id text not null,
  name text not null,
  created_at timestamp not null default current_timestamp,
  foreign key (election_id) references elections(id)
    on delete cascade,
  unique (election_id, contest_id, name)
);

create table write_ins (
  sequence_id integer primary key autoincrement,
  id varchar(36) not null unique,
  cvr_id varchar(36) not null,
  election_id varchar(36) not null,
  side text not null check (side = 'front' or side = 'back'),
  contest_id text not null,
  option_id text not null,
  is_unmarked boolean not null default false,
  official_candidate_id text,
  write_in_candidate_id varchar(36),
  is_invalid boolean not null default false,
  adjudicated_at timestamp,
  created_at timestamp not null default current_timestamp,
  foreign key (election_id) references elections(id),
  foreign key (cvr_id) references cvrs(id)
    on delete cascade,
  foreign key (cvr_id, side) references ballot_images(cvr_id, side),
  foreign key (write_in_candidate_id) references write_in_candidates(id),
  unique (cvr_id, contest_id, option_id),
  check (
    (
      (case when official_candidate_id is null then 0 else 1 end) +
      (case when write_in_candidate_id is null then 0 else 1 end) +
      is_invalid
    ) < 2
  )
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
  is_blank boolean not null,
  has_overvote boolean not null,
  has_undervote boolean not null,
  has_write_in boolean not null,
  created_at timestamp not null default current_timestamp,
  foreign key (election_id) references elections(id)
    on delete cascade,
  foreign key (election_id, batch_id) references scanner_batches(election_id, id)
);

create index idx_cvrs_election_id on cvrs(election_id);
create index idx_cvrs_ballot_id on cvrs(ballot_id);

create table vote_adjudications (
  election_id varchar(36) not null,
  cvr_id varchar(36) not null,
  contest_id text not null,
  option_id text not null,
  is_vote boolean not null,
  created_at timestamp not null default current_timestamp,
  primary key (election_id, cvr_id, contest_id, option_id),
  foreign key (election_id) references elections(id)
    on delete cascade,
  foreign key (cvr_id) references cvrs(id)
    on delete cascade
);

create table scanner_batches (
  id text not null,
  label text not null,
  scanner_id text not null,
  election_id varchar(36) not null,
  primary key (election_id, id),
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

create table manual_results (
  id integer primary key,
  election_id integer not null,
  precinct_id text not null,
  ballot_style_id text not null,
  voting_method text not null 
    check (voting_method = 'absentee' or voting_method = 'precinct'),
  ballot_count integer not null,
  contest_results text not null,
  created_at timestamp not null default current_timestamp,
  unique (election_id, precinct_id, ballot_style_id, voting_method),
  foreign key (election_id) references elections(id)
    on delete cascade
);

create table manual_result_write_in_candidate_references (
  manual_result_id integer not null,
  write_in_candidate_id varchar(36) not null,
  primary key (manual_result_id, write_in_candidate_id),
  foreign key (manual_result_id) references manual_results(id)
    on delete cascade,
  foreign key (write_in_candidate_id) references write_in_candidates(id)
    on delete cascade
);

create table settings (
  -- enforce singleton table
  id integer primary key check (id = 1),
  current_election_id varchar(36),
  foreign key (current_election_id) references elections(id)
);

insert into settings default values;

create table system_information (
  -- enforce singleton table
  id integer primary key check (id = 1),
  maximum_usable_disk_space integer not null default 1
);

insert into system_information default values;

create table diagnostics (
  id integer primary key,
  type text not null,
  outcome text not null check (outcome = 'pass' or outcome = 'fail'),
  message text,
  timestamp number not null
);  

-- to track data changes in order to invalidate cached data
create table data_versions (
  election_id varchar(36),
  cvrs_data_version integer,
  primary key (election_id),
  foreign key (election_id) references elections(id)
    on delete cascade
);

create trigger cvr_file_added after insert on cvr_files
begin
  insert into data_versions (election_id, cvrs_data_version)
    values (new.election_id, 1)
  on conflict (election_id) do update set 
    cvrs_data_version = data_versions.cvrs_data_version + 1;
end;

create trigger cvr_file_removed after delete on cvr_files
begin
  update data_versions
    set cvrs_data_version = data_versions.cvrs_data_version + 1
    where election_id = old.election_id;
end;

create trigger adjudication_added before insert on vote_adjudications
begin
  update data_versions
    set cvrs_data_version = data_versions.cvrs_data_version + 1
    where election_id = new.election_id;
end;

create trigger adjudication_removed before delete on vote_adjudications
begin
  update data_versions
    set cvrs_data_version = data_versions.cvrs_data_version + 1
    where election_id = old.election_id;
end;
create table elections (
  id text primary key,
  data text not null,
  is_official_results integer not null default false,
  created_at text not null default current_timestamp,
  deleted_at text
) strict;

create table precincts(
  election_id text not null,
  id text not null,
  name text not null,
  sort_index integer not null,
  primary key (election_id, id),
  foreign key (election_id) references elections(id)
    on delete cascade
) strict;

create table ballot_styles (
  election_id text not null,
  id text not null,
  party_id text,
  primary key (election_id, id),
  foreign key (election_id) references elections(id)
    on delete cascade
) strict;

create table ballot_styles_to_precincts(
  election_id text not null,
  ballot_style_id text not null,
  precinct_id text not null,
  primary key (election_id, ballot_style_id, precinct_id),
  foreign key (election_id, ballot_style_id) references ballot_styles(election_id, id)
    on delete cascade
  foreign key (election_id, precinct_id) references precincts(election_id, id)
    on delete cascade
) strict;

create table voting_methods(
  election_id text not null,
  voting_method text not null 
    check (voting_method = 'absentee' or voting_method = 'precinct' or voting_method = 'provisional'),
  primary key (election_id, voting_method),
  foreign key (election_id) references elections(id)
    on delete cascade
) strict;

create table write_in_candidates (
  id text primary key,
  election_id text not null,
  contest_id text not null,
  name text not null,
  created_at text not null default current_timestamp,
  foreign key (election_id) references elections(id)
    on delete cascade,
  unique (election_id, contest_id, name)
) strict;

create table write_ins (
  sequence_id integer primary key autoincrement,
  id text not null unique,
  cvr_id text not null,
  election_id text not null,
  side text not null check (side = 'front' or side = 'back'),
  contest_id text not null,
  option_id text not null,
  official_candidate_id text,
  write_in_candidate_id text,
  is_invalid integer not null default false,
  adjudicated_at text,
  created_at text not null default current_timestamp,
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
) strict;

create table cvrs (
  id text primary key,
  election_id text not null,
  ballot_id text not null,
  ballot_style_id text not null,
  ballot_type text not null 
    check (ballot_type = 'absentee' or ballot_type = 'precinct' or ballot_type = 'provisional'),
  batch_id text not null,
  precinct_id text not null,
  sheet_number integer check (sheet_number is null or sheet_number > 0),
  votes text not null,
  is_blank integer not null,
  created_at text not null default current_timestamp,
  foreign key (election_id) references elections(id)
    on delete cascade,
  foreign key (batch_id) references scanner_batches(id)
) strict;

create index idx_cvrs_election_id on cvrs(election_id);
create index idx_cvrs_ballot_id on cvrs(ballot_id);

create table scanner_batches (
  id text not null,
  label text not null,
  scanner_id text not null,
  election_id text not null,
  primary key (id),
  foreign key (election_id) references elections(id)
    on delete cascade
) strict;

create table cvr_files (
  id text primary key,
  election_id text not null,
  is_test_mode integer not null,
  filename text not null,
  export_timestamp text not null,
  precinct_ids text not null,
  scanner_ids text not null,
  sha256_hash text not null,
  created_at text not null default current_timestamp,
  foreign key (election_id) references elections(id)
    on delete cascade
) strict;

create table cvr_file_entries (
  cvr_file_id text not null,
  cvr_id text not null,
  primary key (cvr_file_id, cvr_id),
  foreign key (cvr_file_id) references cvr_files(id)
    on delete cascade,
  foreign key (cvr_id) references cvrs(id)
    on delete cascade
) strict;

create table ballot_images (
  cvr_id text not null,
  side text not null check (side = 'front' or side = 'back'),
  image blob not null,
  layout text not null,
  primary key (cvr_id, side),
  foreign key (cvr_id) references cvrs(id)
    on delete cascade
) strict;

create table manual_results (
  id integer primary key,
  election_id text not null,
  precinct_id text not null,
  ballot_style_id text not null,
  voting_method text not null 
    check (voting_method = 'absentee' or voting_method = 'precinct'),
  ballot_count integer not null,
  contest_results text not null,
  created_at text not null default current_timestamp,
  unique (election_id, precinct_id, ballot_style_id, voting_method),
  foreign key (election_id) references elections(id)
    on delete cascade
) strict;

create table manual_result_write_in_candidate_references (
  manual_result_id integer not null,
  write_in_candidate_id text not null,
  primary key (manual_result_id, write_in_candidate_id),
  foreign key (manual_result_id) references manual_results(id)
    on delete cascade,
  foreign key (write_in_candidate_id) references write_in_candidates(id)
    on delete cascade
) strict;

create table system_settings (
  -- enforce singleton table
  id integer primary key check (id = 1),
  data text not null -- JSON blob
) strict;

create table settings (
  -- enforce singleton table
  id integer primary key check (id = 1),
  current_election_id text,
  foreign key (current_election_id) references elections(id)
) strict;

insert into settings default values;

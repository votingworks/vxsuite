create table elections (
  id text primary key,
  election_data text not null,
  system_settings_data text not null,
  election_package_hash text not null,
  is_official_results integer not null default false,
  created_at text not null default current_timestamp
) strict;

create table precincts(
  election_id text not null,
  id text not null,
  name text not null,
  primary key (election_id, id),
  foreign key (election_id) references elections(id)
    on delete cascade
) strict;

create table precinct_registered_voter_counts (
  election_id text not null,
  precinct_id text not null,
  count integer not null,
  primary key (election_id, precinct_id),
  foreign key (election_id, precinct_id) references precincts(election_id, id)
    on delete cascade
) strict;

create table precinct_split_registered_voter_counts (
  election_id text not null,
  precinct_id text not null,
  split_id text not null,
  count integer not null,
  primary key (election_id, precinct_id, split_id),
  foreign key (election_id, precinct_id) references precincts(election_id, id)
    on delete cascade
) strict;

create table ballot_styles (
  election_id text not null,
  group_id text not null,
  party_id text,
  primary key (election_id, group_id),
  foreign key (election_id) references elections(id)
    on delete cascade
) strict;

create table ballot_styles_to_precincts(
  election_id text not null,
  ballot_style_group_id text not null,
  precinct_id text not null,
  primary key (election_id, ballot_style_group_id, precinct_id),
  foreign key (election_id, ballot_style_group_id) references ballot_styles(election_id, group_id)
    on delete cascade,
  foreign key (election_id, precinct_id) references precincts(election_id, id)
    on delete cascade
) strict;

create index idx_ballot_styles_to_precincts_precinct_id on 
  ballot_styles_to_precincts(election_id, precinct_id);

create table ballot_styles_to_districts(
  election_id text not null,
  ballot_style_group_id text not null,
  district_id text not null,
  primary key (election_id, ballot_style_group_id, district_id),
  foreign key (election_id, ballot_style_group_id) references ballot_styles(election_id, group_id)
    on delete cascade
) strict;

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
) strict;

create table voting_methods(
  election_id text not null,
  voting_method text not null
    check (voting_method = 'absentee' or voting_method = 'precinct' or voting_method = 'provisional' or voting_method = 'early_voting'),
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
  contest_id text not null,
  option_id text not null,
  is_unmarked integer not null default false,
  official_candidate_id text,
  write_in_candidate_id text,
  is_invalid integer not null default false,
  is_undetected integer not null default false,
  created_at text not null default current_timestamp,
  machine_marked_text text,
  foreign key (election_id) references elections(id),
  foreign key (cvr_id) references cvrs(id)
    on delete cascade,
  foreign key (write_in_candidate_id) references write_in_candidates(id)
    on delete set null,
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
  ballot_style_group_id text not null,
  ballot_type text not null 
    check (ballot_type = 'absentee' or ballot_type = 'precinct' or ballot_type = 'provisional'),
  batch_id text not null,
  precinct_id text not null,
  card_type text not null default 'bmd' check (card_type = 'bmd' or card_type = 'hmpb'),
  sheet_number integer check (sheet_number is null or sheet_number > 0),
  votes text not null,
  adjudicated_votes text,
  mark_scores text,
  is_blank integer not null,
  has_overvote integer not null,
  has_undervote integer not null,
  has_write_in integer not null,
  has_marginal_mark integer not null default false,
  has_crossover_vote integer not null,
  is_adjudicated integer not null default false,
  created_at text not null default current_timestamp,
  foreign key (election_id) references elections(id)
    on delete cascade,
  foreign key (election_id, batch_id) references scanner_batches(election_id, id)
) strict;

create index idx_cvrs_election_id on cvrs(election_id);
create index idx_cvrs_ballot_id on cvrs(ballot_id);
create index idx_cvrs_batch_id on cvrs(election_id, batch_id);

create table scanner_batches (
  id text not null,
  label text not null,
  scanner_id text not null,
  election_id text not null,
  scanner_machine_type text check (scanner_machine_type is null or scanner_machine_type = 'central' or scanner_machine_type = 'precinct'),
  polling_place_id text,
  ballot_casting_mode text check (ballot_casting_mode is null or ballot_casting_mode = 'early_voting' or ballot_casting_mode = 'election_day'),
  started_at text not null,
  primary key (election_id, id),
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
  polling_place_ids text not null,
  batch_ids text not null,
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
  -- image files stored on disk based on cvr_id
  cvr_id text not null,
  side text not null check (side = 'front' or side = 'back'),
  layout text, -- Machine-marked ballots do not have a layout
  primary key (cvr_id, side),
  foreign key (cvr_id) references cvrs(id)
    on delete cascade
) strict;

create table manual_results (
  id integer primary key,
  election_id text not null,
  precinct_id text not null,
  ballot_style_group_id text not null,
  voting_method text not null
    check (voting_method = 'absentee' or voting_method = 'precinct' or voting_method = 'early_voting'),
  ballot_count integer not null,
  contest_results text not null,
  created_at text not null default current_timestamp,
  unique (election_id, precinct_id, ballot_style_group_id, voting_method),
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

create table settings (
  -- enforce singleton table
  id integer primary key check (id = 1),
  current_election_id text,
  is_client_adjudication_enabled integer not null default 0,
  foreign key (current_election_id) references elections(id)
) strict;

insert into settings default values;

create table diagnostics (
  id integer primary key,
  type text not null,
  outcome text not null check (outcome = 'pass' or outcome = 'fail'),
  message text,
  timestamp integer not null
) strict;

create table machines (
  machine_id text primary key,
  machine_role text not null
    check (
      machine_role = 'admin-host' or
      machine_role = 'admin-client' or
      machine_role = 'scanner'
    ),
  status text not null
    check (status in ('offline', 'online_locked', 'active', 'adjudicating')),
  auth_type text,
  polling_place_id text,
  registration_error text,
  last_seen_at integer not null
) strict;

create table machine_ballot_adjudication_assignments (
  cvr_id text not null references cvrs(id) on delete cascade,
  election_id text not null references elections(id) on delete cascade,
  machine_id text not null,
  claimed_at integer not null,
  completed_at integer,
  status text not null default 'claimed'
    check (status in ('claimed', 'completed')),
  primary key (cvr_id, election_id)
) strict;

-- to track data changes in order to invalidate cached data
create table data_versions (
  election_id text,
  cvrs_data_version integer,
  primary key (election_id),
  foreign key (election_id) references elections(id)
    on delete cascade
) strict;

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

create trigger cvr_adjudication_updated after update of adjudicated_votes on cvrs
begin
  update data_versions
    set cvrs_data_version = data_versions.cvrs_data_version + 1
    where election_id = new.election_id;
end;

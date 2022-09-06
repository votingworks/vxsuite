create table elections (
  id serial primary key,
  data text not null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp,
  deleted_at timestamp
);

create table adjudications (
	id varchar(36) primary key,
	contest_id text,
	transcribed_value text,
	cvr_id varchar(36),
	foreign key (cvr_id) references cvrs(id)
		on update cascade
		on delete cascade
);

create table cvrs (
	id varchar(36) primary key,
	ballot_id varchar(36) unique,
	imported_by_file varchar(36),
	data text,
	foreign key (imported_by_file) references cvr_files(id)
	  on update cascade
	  on delete cascade
);

create table cvr_files (
	id varchar(36) primary key,
	election_id varchar(36) not null,
	signature text,
	filename text,
	timestamp text,
	imported_cvr_count integer,
	duplicated_cvr_count integer,
	scanner_ids text,
	precinct_ids text,
	contains_test_mode_cvrs boolean,
	foreign key (election_id) references elections(id)
	  on update cascade
	  on delete cascade
);
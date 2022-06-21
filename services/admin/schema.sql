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
	data text
);
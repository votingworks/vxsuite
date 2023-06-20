create table election (
  -- enforce singleton table
  id integer primary key check (id = 1),
  election_data text not null
);
create table ballot_positions (
  style_id text primary key,
  positions text not null -- JSON string of SheetPositions[]
) strict;

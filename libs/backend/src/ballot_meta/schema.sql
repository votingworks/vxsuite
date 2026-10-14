create table ballot_positions (
  style_id text primary key,
  positions text not null -- JSON string of SheetPositions[]
) strict;

create table candidate_orderings (
  style_id text primary key,
  orderings text not null -- JSON string of CandidateOrderings
) strict;

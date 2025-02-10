CREATE TABLE voters (
    voter_id TEXT PRIMARY KEY,
    voter_data TEXT not null
);

CREATE TABLE elections (
    election_id TEXT PRIMARY KEY,
    election_data TEXT not null,
    valid_street_data TEXT,
    is_absentee_mode BOOLEAN NOT NULL
);

CREATE TABLE event_log (
    event_id INTEGER not null, -- local event id
    machine_id TEXT not null,
    physical_time INTEGER NOT NULL, -- physical time of the event
    logical_counter INTEGER NOT NULL, -- logical time of the event
    event_type TEXT, -- e.g., "check_in", "undo_check_in"
    voter_id TEXT, -- voter_id of the voter involved in the event, if any
    event_data TEXT not null, -- JSON data for additional details associated with the event (id type used for check in, etc.)
    PRIMARY KEY (event_id, machine_id)
);

-- Index for sorting events by hybrid logical clock physical time then logical counter - machine id is included in the rare event of tie
CREATE INDEX idx_hlc ON event_log (physical_time, logical_counter, machine_id); 
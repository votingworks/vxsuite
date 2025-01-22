CREATE TABLE voters (
    voter_id TEXT PRIMARY KEY,
    voter_data TEXT not null
);

CREATE TABLE elections (
    election_id TEXT PRIMARY KEY,
    election_data TEXT not null
);

CREATE TABLE event_log (
    event_id INTEGER,
    machine_id TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    event_type TEXT, -- e.g., "check_in", "undo_check_in"
    voter_id TEXT, -- voter_id of the voter involved in the event, if any
    vector_clock TEXT, -- JSON data for the vector clock at the time of the event
    event_data TEXT not null, -- JSON data for additional details associated with the event (id type used for check in, etc.)
    PRIMARY KEY (event_id, machine_id)
);
CREATE TABLE voters (
    voter_id TEXT PRIMARY KEY,
    original_first_name TEXT,
    original_middle_name TEXT,
    original_last_name TEXT,
    original_suffix TEXT,
    updated_first_name TEXT,
    updated_middle_name TEXT,
    updated_last_name TEXT,
    updated_suffix TEXT,
    voter_data TEXT not null
);

CREATE TABLE machines (
    machine_id TEXT PRIMARY KEY,
    status TEXT NOT NULL, -- PollbookConnectionStatus enum
    last_seen INTEGER NOT NULL, -- last time the machine was seen
    pollbook_information TEXT NOT NULL -- JSON blob of PollbookInformation
);

CREATE TABLE elections (
    election_id TEXT PRIMARY KEY,
    election_data TEXT not null,
    ballot_hash TEXT not null,
    package_hash TEXT not null,
    valid_street_data TEXT,
    is_absentee_mode BOOLEAN NOT NULL,
    configured_precinct_id TEXT
);

CREATE TABLE event_log (
    event_id INTEGER not null, -- local event id
    machine_id TEXT not null,
    physical_time INTEGER NOT NULL, -- physical time of the event
    logical_counter INTEGER NOT NULL, -- logical time of the event
    event_type TEXT, -- EventType enum
    voter_id TEXT, -- voter_id of the voter involved in the event, if any
    event_data TEXT not null, -- JSON data for additional details associated with the event (id type used for check in, etc.)
    PRIMARY KEY (event_id, machine_id)
);

-- Utility table to store any simple fields that need to be shared between the local and peer servers
CREATE TABLE config_data (
    id INTEGER PRIMARY KEY CHECK (id = 0), -- enforces there is only one row to this table
    configuration_status TEXT
);
INSERT INTO config_data (id, configuration_status) VALUES (0, null);

-- Index for sorting events by hybrid logical clock physical time then logical counter - machine id is included in the rare event of tie
CREATE INDEX idx_hlc ON event_log (physical_time, logical_counter, machine_id); 
CREATE INDEX idx_machine_hlc ON event_log (machine_id, physical_time, logical_counter); 
CREATE INDEX idx_voter_hlc ON event_log (voter_id, physical_time, logical_counter, machine_id); 
CREATE INDEX idx_updated_first_name ON voters (updated_first_name);
CREATE INDEX idx_updated_last_name ON voters (updated_last_name);

CREATE TABLE check_in_status (
    voter_id TEXT NOT NULL,
    machine_id TEXT,
    is_checked_in BOOLEAN NOT NULL,
    PRIMARY KEY (voter_id)
);

CREATE INDEX idx_check_in_status ON check_in_status (is_checked_in);
CREATE INDEX idx_machine_check_in_status ON check_in_status (machine_id, is_checked_in);
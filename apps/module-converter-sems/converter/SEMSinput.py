
#
# File formats expected
#
# First, an explainer of how elections work (at least in Mississippi, but this likely generalizes)
#
# TLDR: the atomic unit of election administration is the split, which is a portion of a precinct.
# Everyone in a given split has the same ballot. A split ID tells you both the precinct and the ballot style.
#
# Now for some details
#
# The state is partitioned into districts in a number of independent ways:
# - congressional districts
# - state senate districts
# - state house districts
# - counties (which, incidentally, administer elections)
# - within a county: supervisor districts
# - within a county: justice court judge districts
# - within a county: constable districts
# - within a county: precincts, which is the logical unit for election administration.
#
# The key thing to note here is that this isn't hierarchical or nicely partitioned: state senate districts,
# state house districts, and counties overlap in weird ways. Within a county, the districts like constable
# districts don't necessarily split cleanly across precinct lines.
#
# All of this means that, within a precinct, there are "splits." A single split *is* wholly contained
# within a precinct. A split is the true atomic unit of election administration: every voter within a split
# gets the same ballot (minor exception: primaries where they can get a Republican or Democratic ballot.)
# That is called the ballot style. A ballot style identifier is unique within a county.
#
# So, to figure out which contests to present to a voter, you need the ballot style.
# From this, you can identify the split, and from the split, the set of districts that are mapped to it.
# For each district, there are contests mapped to it, and there you go.
#
# Election contests belong to a particular district. There are contests that map to each type of district.
# 
# 
#
# Two files: election_details and candidate_id_mapping
#
# election_details
# - 9 sections, each row starts with 0-8 to idenify which section it's a part of
# - section 0 is one row: 0, "GEMS Import Data", MAJOR_VERSION, MINOR_VERSION, SORT_BY, ?, ?, ?
# - section 1 is one row: 1, ELECTION_TITLE, ELECTION_DATE
# - section 2 is one row per district: 2, PARENT_DISTRICT, DISTRICT_ID, DISTRICT_LABEL
# - section 3 is one row per polling location: 3, REGION_ID, LOCATION_ID, LOCATION_LABEL
# - section 4 is one row per precinct/split: 4, LOCATION_ID, PRECINCT_ID, SPLIT_ID, PRECINCT_LABEL, NUM_REG_VOTERS, BALLOT_STYLE
# - section 5 is one row mapping which splits have which districts: 5, SPLIT_ID, DISTRICT_ID
# - section 6 is one row per party: 6, PARTY_ID, PARTY_LABEL, PARTY_ABBREV, PARTY_ID(again), PARTY_LABEL_ON_BALLOT
# - section 7 is one row per contest: 7, CONTEST_ID, CONTEST_LABEL, CONTEST_TYPE, 0, DISTRICT_ID, NUM_VOTE_FOR, NUM_WRITE_INS, CONTEST_TEXT, PARTY_ID, 0
### contest_type 0 candidate, 1 question/measure
# - section 8 is one row per candidate: 8, CONTEST_ID, CANDIDATE_ID, CANDIDATE_LABEL, CANDIDATE_TYPE, SORT_SEQ, PARTY_ID, CANDIDATE_LABEL_ON_BALLOT
### candidate_id for measures are 101 for Yes, 102 for No
### candidate_type is 0 for normal, 1 for write-in (??), and 2 for registered write-in
### party_id is 0 for non-partisan
#
#
# candidate_id_mapping
# every row is
# 9, COUNTY_CODE, CONTEST_ID, CANDIDATE_SEQ_NUM, SEMS_CANDIDATE_ID
#
# This data is not implicit in the first file, because the candidate_id in the first file is not unique across the board,
# it's only unique within the question where that candidate exists. Results have to be reported by SEMS candidate ID which
# is provided in this second file.
#
# In our system, it makes sense to use this SEMS candidate ID as the actual ID.
#
#
# To determine all the contests that a ballot style has, we have to do this (I THINK):
# - determine the precinct/split of the given ballot style
# - look up all the districts for that split
# - find all the contests for those districts


import csv, json, sqlite3, sys, re
from .counties import COUNTIES

ELECTION_TABLES = {
    "1": {"name": "election", "fields": ["title", "date"]},
    "2": {"name": "districts", "fields": ["parent_district_id", "district_id", "label"]},
    "3": {"name": "locations", "fields": ["region_id", "location_id", "label"]},
    "4": {"name": "splits", "fields": ["location_id", "precinct_id", "split_id", "precinct_label", "num_reg_voters", "ballot_style"]},
    "5": {"name": "split_districts", "fields": ["split_id", "district_id"]},
    "6": {"name": "parties", "fields": ["party_id", "label", "abbrev", "party_id_2", "label_on_ballot"]},
    "7": {"name": "contests", "fields": ["contest_id", "label", "type", "XXX1", "district_id", "num_vote_for", "num_write_ins", "contest_text", "party_id", "XXX2"]},
    "8": {"name": "candidates", "fields": ["contest_id", "candidate_id", "label", "type", "sort_seq", "party_id", "label_on_ballot"]},
    "9": {"name": "sems_candidates", "fields": ["county_code", "contest_id", "candidate_id", "candidate_sems_id"]}
}
    
def process_election_files(election_details_file_path, candidate_map_file_path):
    election_details_file = open(election_details_file_path, "r")
    candidate_map_file = open(candidate_map_file_path, "r")

    # the CSV files have an extraneous space at the beginning of all fields other than the first.
    election_details_csv = csv.reader(election_details_file, skipinitialspace=True)
    candidate_map_csv = csv.reader(candidate_map_file, skipinitialspace=True)
    
    db = sqlite3.connect(":memory:")
    c = db.cursor()
    
    for table_def in ELECTION_TABLES.values():
        fields = ["%s varchar(500)" % f for f in table_def["fields"]]
        sql = "create table %s (%s)" % (table_def["name"], ",".join(fields))
        c.execute(sql)

    def process_row(row):
        # windows ctrl-m issue, shows up as an extra row
        if len(row) == 0:
            return
        table_def = ELECTION_TABLES.get(row[0], None)

        if not table_def:
            return

        values = ["?"] * len(table_def["fields"])
        sql = "insert into %s values (%s)" % (table_def['name'], ",".join(values))

        c.execute(sql, row[1:])

    for row in election_details_csv:
        process_row(row)

    for row in candidate_map_csv:
        process_row(row)

    
    # now it's all in in-memory sqlite

    # the county ID is in the sems_candidates table (only stable place it appears)
    sql = "select distinct(county_code) from sems_candidates"
    county_id = c.execute(sql).fetchall()[0][0]

    # basic info
    sql = "select title, date from election"
    election_title, election_date = c.execute(sql).fetchone()

    # parties
    sql = "select party_id, label, abbrev from parties"
    parties = [{"id": r[0], "name": r[1], "abbrev": r[2]} for r in c.execute(sql).fetchall()]
    parties_by_abbrev = dict([[p["abbrev"], p["id"]] for p in parties])

    # districts
    sql = "select district_id, label from districts"
    districts = [{"id": r[0], "name": r[1]} for r in c.execute(sql).fetchall()]

    # contests
    sql = "select contest_id, contests.label, type, contests.district_id, num_vote_for, num_write_ins, contest_text, party_id, districts.label, contest_text from contests, districts where contests.district_id = districts.district_id"
    contests = [{
        "id": r[0],
        "section": r[8],
        "districtId": r[3],
        "type": "candidate" if r[2] == "0" else "yesno",
        "partyId": None if r[7] == "0" else r[7],
        "official_label": r[1],
        "title": r[9].split("\\n")[1],
        "seats": int(r[4]),
        "allowWriteIns": int(r[5]) > 0
    } for r in c.execute(sql).fetchall()]

    # remove null partyIds
    for contest in contests:
        if not contest["partyId"]:
            del contest["partyId"]
    
    # candidates
    sql = """
    select
    sems_candidates.candidate_sems_id, parties.label_on_ballot, candidates.label_on_ballot,
    parties.party_id from candidates, parties, sems_candidates
    where
    candidates.contest_id = ? and
    sems_candidates.county_code = ? and
    candidates.contest_id = sems_candidates.contest_id and candidates.candidate_id = sems_candidates.candidate_id and
    candidates.party_id = parties.party_id
    order by cast(candidates.sort_seq as integer)"""

    for contest in contests:
        contest["candidates"] = [{
            "id": r[0],
            "name": r[2],
            "partyId": r[3]
        } for r in c.execute(sql, [contest["id"], county_id])]
        
    sql = "select precinct_id, precinct_label from splits group by precinct_id, precinct_label"
    precincts = [{"id": r[0], "name": r[1]} for r in c.execute(sql)]
        
    sql = "select distinct(ballot_style) from splits"
    ballot_styles = [{"id": r[0]} for r in c.execute(sql)]
    
    # if there is a party abbreviation tacked on to the numerical ballot style, extract it, e.g. "12D"
    for ballot_style in ballot_styles:
        match_result = re.match("[0-9]+(.+)", ballot_style["id"])
        if match_result:
            possible_party_abbrev = match_result.groups()[0]
            if possible_party_abbrev in parties_by_abbrev:
                ballot_style["partyId"] = parties_by_abbrev[possible_party_abbrev]

    sql_precincts = "select distinct(precinct_id) from splits where ballot_style = ?"
    sql_districts = "select distinct(district_id) from splits, split_districts where ballot_style = ? and splits.split_id = split_districts.split_id"
    for ballot_style in ballot_styles:
        ballot_style["precincts"] = [r[0] for r in c.execute(sql_precincts, [ballot_style["id"]])]
        ballot_style["districts"] = [r[0] for r in c.execute(sql_districts, [ballot_style["id"]])]
    

    vx_election = {
        "title": election_title,
        "state": "State of Mississippi",
        "county": {
            "id": county_id,
            "name": "%s County" % COUNTIES[county_id]
        },
        "date": election_date,
        "parties": parties,
        "contests": contests,
        "districts": districts,
        "precincts": precincts,
        "ballotStyles": ballot_styles,
        "sealURL": "/seals/Seal_of_Mississippi_BW.svg"
    }

    return(vx_election)

def main(main_file, cand_map_file):
    vx_election = process_election_files(main_file, cand_map_file)
    return json.dumps(vx_election, indent=2)

if __name__ == "__main__": # pragma: no cover this is the main
    print(main(sys.argv[1], sys.argv[2]))

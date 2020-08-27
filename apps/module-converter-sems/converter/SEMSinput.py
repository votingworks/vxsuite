
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
from dateutil.parser import parse as date_parse
from datetime import timedelta, timezone

from .counties import COUNTIES

ELECTION_TABLES = {
    "1": {"name": "election", "fields": ["title", "date"]},
    "2": {"name": "districts", "fields": ["parent_district_id", "district_id", "label"]},
    "3": {"name": "locations", "fields": ["region_id", "location_id", "label"]},
    "4": {"name": "splits", "fields": ["location_id", "precinct_id", "split_id", "precinct_label", "num_reg_voters", "ballot_style"]},
    "5": {"name": "split_districts", "fields": ["split_id", "district_id"]},
    "6": {"name": "parties", "fields": ["party_id", "label", "abbrev", "party_id_2", "label_on_ballot"]},
    "7": {"name": "contests", "fields": ["contest_id", "label", "type", "XXX1", "district_id", "num_vote_for", "num_write_ins", "contest_text", "party_id", "XXX2", "_sort_index"]},
    "8": {"name": "candidates", "fields": ["contest_id", "candidate_id", "label", "type", "sort_seq", "party_id", "label_on_ballot"]},
    "9": {"name": "sems_candidates", "fields": ["county_code", "contest_id", "candidate_id", "candidate_sems_id"]}
}


FULL_PARTY_NAMES = {
    "democrat": "Democratic Party",
    "nonpartisan": "Nonpartisan"
}

def full_party_name(short_party_name):
    return FULL_PARTY_NAMES.get(short_party_name.lower(), short_party_name + " Party")

def cleanup_text(text):
    return text.replace("\\n", "\n").strip("\n")

def process_election_files(election_details_file_path, candidate_map_file_path):
    election_details_file = open(election_details_file_path, "r")
    candidate_map_file = open(candidate_map_file_path, "r")

    # the CSV files have an extraneous space at the beginning of all fields other than the first.
    election_details_csv = csv.reader(election_details_file, skipinitialspace=True)
    candidate_map_csv = csv.reader(candidate_map_file, skipinitialspace=True)
    
    db = sqlite3.connect(":memory:")

    # this returns rows that behave like dictionaries instead of arrays
    db.row_factory = sqlite3.Row
    
    c = db.cursor()
    
    sort_order = {}
    for table_key, table_def in ELECTION_TABLES.items():
        sort_order[table_key] = 0
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

        fields = table_def["fields"]
        value_placeholders = ["?"] * len(fields)

        sql = "insert into %s values (%s)" % (table_def['name'], ",".join(value_placeholders))

        id, *values = row
        if fields[-1] == "_sort_index":
            sort_order[id] += 1
            values += [str(sort_order[id])]
        
        c.execute(sql, values)

    for row in election_details_csv:
        process_row(row)

    for row in candidate_map_csv:
        process_row(row)

    
    # now it's all in in-memory sqlite

    # the county ID is in the sems_candidates table (only stable place it appears)
    sql = "select distinct(county_code) as county_code from sems_candidates"
    county_id = c.execute(sql).fetchone()['county_code']

    # basic info
    sql = "select title, date from election"
    election_title, election_date = c.execute(sql).fetchone()

    # parties
    sql = "select party_id, label, abbrev from parties"
    parties = [{"id": r['party_id'], "name": r['label'], "fullName": full_party_name(r['label']), "abbrev": r['abbrev']} for r in c.execute(sql).fetchall()]
    parties_by_abbrev = dict([[p["abbrev"], p["id"]] for p in parties])
    parties_by_id = dict([[p["id"], p] for p in parties])

    # districts
    sql = "select district_id, label from districts"
    districts = [{"id": r['district_id'], "name": r['label']} for r in c.execute(sql).fetchall()]

    # look for either-neither contests, which have the same label and description
    sql = "select label, contest_text from contests where type = '1' group by label, contest_text having count(*) = 2"
    either_neither_labels = [r['label'] for r in c.execute(sql).fetchall()]
    
    # contests
    sql = "select contest_id, contests.label as contest_label, type, contests.district_id as district_id, num_vote_for, num_write_ins, contest_text, party_id, districts.label as district_label from contests, districts where contests.district_id = districts.district_id order by cast(_sort_index as integer)"
    contests = [{
        "id": r['contest_id'],
        "section": r['district_label'],
        "districtId": r['district_id'],
        "type": "candidate",
        "partyId": None if r['party_id'] == "0" else r['party_id'],
        "title": cleanup_text(r['contest_text']).split("\n")[1],
        "seats": int(r['num_vote_for']),
        "allowWriteIns": int(r['num_write_ins']) > 0
    } if r[2] == "0" else {
        "id": r['contest_id'],
        "section": r['district_label'],
        "districtId": r['district_id'],
        "type": "yesno",
        "title": cleanup_text(r['contest_text']).split("\n")[0] + ": " + r[1],
        "description": "\n".join(cleanup_text(r['contest_text']).split("\n")[1:])
    } if r['contest_label'] not in either_neither_labels else {
        "id": r['contest_id'],  ### placeholder, left here for the right order
        "type": "placeholder",
        "label": r['contest_label']
    } for r in c.execute(sql).fetchall()]

    # either-neither contests
    either_neither_contest_ids = []
    for label in either_neither_labels:
        sql = "select contest_id, contests.district_id as district_id, contest_text, districts.label as district_label, contests.label as contest_label from contests, districts where contests.district_id = districts.district_id and contests.label = ? order by contest_id"
        either_neither_contest, pick_one_contest = c.execute(sql, [label]).fetchall()
        text = cleanup_text(either_neither_contest['contest_text']).split("\n")
        either_neither_contest_ids.append(either_neither_contest['contest_id'])
        either_neither_contest_ids.append(pick_one_contest['contest_id'])
        new_contest = {
            "id": f"{either_neither_contest['contest_id']}-{pick_one_contest['contest_id']}-either-neither",
            "section": either_neither_contest['district_label'],
            "districtId": either_neither_contest['district_id'],
            "type": "ms-either-neither",
            "title": text[0],
            "eitherNeitherContestId": either_neither_contest['contest_id'],
            "pickOneContestId": pick_one_contest['contest_id'],
            "description": f"<b>{either_neither_contest['contest_label']}</b>\n\n" + "\n".join(text[1:])
        }

        # find where to place this contest
        # assumes the two placeholders are sequential
        location = [i for (i,c) in enumerate(contests) if c['type'] == 'placeholder' and c['label'] == label][0]
        contests.pop(location)
        contests.pop(location)
        contests.insert(location, new_contest)
            

    # remove null partyIds
    for contest in contests:
        if "partyId" in contest and not contest["partyId"]:
            del contest["partyId"]

    # candidates or options
    for contest in contests:
        if contest['type'] == 'candidate':
            # candidates
            sql = """
            select
            sems_candidates.candidate_sems_id as candidate_sems_id, candidates.label_on_ballot as label_on_ballot,
            candidates.party_id as party_id from candidates, sems_candidates
            where
            candidates.contest_id = ? and
            sems_candidates.county_code = ? and
            candidates.contest_id = sems_candidates.contest_id and candidates.candidate_id = sems_candidates.candidate_id
            order by cast(candidates.sort_seq as integer)"""

            candidates = c.execute(sql, [contest['id'], county_id]).fetchall()
            
            contest["candidates"] = []
            for cand in candidates:
                candidate = {
                    "id": cand['candidate_sems_id'],
                    "name": cand['label_on_ballot']
                }
                if cand['party_id']:
                    candidate["partyId"] = cand['party_id']
                    
                contest["candidates"].append(candidate)
                
        if contest['type'] == 'yesno':
            # sometimes there are "candidates" for measures in SEMS,
            # but they carry the right SEMS ID in the main file, no need for the mapping.
            sql = """
            select
            candidate_id, label, label_on_ballot
            from candidates
            where
            contest_id = ? 
            order by cast(sort_seq as integer)"""

            options = [{
                "id": o['candidate_id'],
                "label": cleanup_text(o['label_on_ballot']).split("\n")[1]
            } for o in c.execute(sql, [contest['id']]).fetchall()]

            contest['yesOption'] = options[0]
            contest['noOption'] = options[1]

        if contest['type'] == 'ms-either-neither':
            # in either or, we have two contests and each has a yes and a no, in that option order
            sql = """
            select
            candidate_id, label, label_on_ballot
            from candidates
            where
            contest_id = ? 
            order by cast(sort_seq as integer)"""

            either_option, neither_option = c.execute(sql, [contest['eitherNeitherContestId']]).fetchall()
            first_option, second_option = c.execute(sql, [contest['pickOneContestId']]).fetchall()

            contest["eitherNeitherLabel"] = cleanup_text(either_option['label_on_ballot']).split("\n")[0]
            contest["pickOneLabel"] = cleanup_text(first_option['label_on_ballot']).split("\n")[0]
            
            contest["eitherOption"] = {
                "id": either_option['candidate_id'],
                "label": cleanup_text(either_option['label_on_ballot']).split("\n")[1]
            }
            contest["neitherOption"] = {
                "id": neither_option['candidate_id'],
                "label": cleanup_text(neither_option['label_on_ballot']).split("\n")[1]
            }

            contest["firstOption"] = {
                "id": first_option['candidate_id'],
                "label": cleanup_text(first_option['label_on_ballot']).split("\n")[1]
            }
            contest["secondOption"] = {
                "id": second_option['candidate_id'],
                "label": cleanup_text(second_option['label_on_ballot']).split("\n")[1]
            }
            
        
    sql = "select precinct_id, precinct_label from splits group by precinct_id, precinct_label"
    precincts = [{"id": r['precinct_id'], "name": r['precinct_label']} for r in c.execute(sql)]
        
    sql = "select distinct(ballot_style) from splits"
    ballot_styles = [{"id": r[0]} for r in c.execute(sql)]
    
    # if there is a party abbreviation tacked on to the numerical ballot style, extract it, e.g. "12D"
    for ballot_style in ballot_styles:
        match_result = re.match("[0-9]+(.+)", ballot_style["id"])
        if match_result:
            possible_party_abbrev = match_result.groups()[0]
            if possible_party_abbrev in parties_by_abbrev:
                ballot_style["partyId"] = parties_by_abbrev[possible_party_abbrev]

    sql_precincts = "select distinct(precinct_id) as precinct_id from splits where ballot_style = ?"
    sql_districts = "select distinct(district_id) as district_id from splits, split_districts where ballot_style = ? and splits.split_id = split_districts.split_id"
    for ballot_style in ballot_styles:
        ballot_style["precincts"] = [r['precinct_id'] for r in c.execute(sql_precincts, [ballot_style["id"]])]
        ballot_style["districts"] = [r['district_id'] for r in c.execute(sql_districts, [ballot_style["id"]])]
    

    # set the timezone to be the earliest US timezone (Hawaii standard time)
    # we don't care about exact timezone because we only want the date, but ISO requires the time
    # so we use the earliest possible timezone to ensure all US elections are displayed correctly.
    tz = timezone(timedelta(hours=-10))
    iso_date = date_parse(election_date).replace(tzinfo=tz).isoformat()
        
    vx_election = {
        "title": election_title,
        "state": "State of Mississippi",
        "county": {
            "id": county_id,
            "name": "%s County" % COUNTIES[county_id]
        },
        "date": iso_date,
        "parties": parties,
        "contests": contests,
        "districts": districts,
        "precincts": precincts,
        "ballotStyles": ballot_styles,
        "sealURL": "/seals/Seal_of_Mississippi_BW.svg",
        "ballotStrings": {
            "officialInitials": "Initialing Manager"
        }
    }

    return(vx_election)

def main(main_file, cand_map_file):
    vx_election = process_election_files(main_file, cand_map_file)
    return json.dumps(vx_election, indent=2)

if __name__ == "__main__": # pragma: no cover this is the main
    print(main(sys.argv[1], sys.argv[2]))

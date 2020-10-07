
#
# Computing SEMS result file from VX CVRs + potentially another SEMS result file
#
# The SEMS result format is not bad as a data model, and seems flexible enough, so going to use something similar
# for our own processing
#
# Key thing to know is that SEMS wants results reported with counts of each candidate for each contest *by precinct*
#
# SEMS format is CSV with fields:
# - county_id
# - precinct_id
# - contest_id
# - contest_title
# - party_id
# - party_label
# - candidate_id (or code 1 that indicates overvotes and code 2 that indicates blank votes)
# - candidate_name
# - candidate_party_id
# - candidate_party_label
# - count
#
# APPROACH: we'll make a table of all field identifiers, leaving out denormalized labels,
# and leaving out the count, and then we'll use group by and joins to get the full rows
#
#
# python makeSEMSResults county_id election.json cvrs.txt sems_results.csv
#

import csv, io, json, sqlite3, sys

NOPARTY_PARTY = {
    "id": "0",
    "name": "No Party",
    "abbrev": "NP"
}

BLANKVOTE_CANDIDATE = {
    "id": "2",
    "name": "Times Blank Voted",
    "partyId": "0"
}
    
OVERVOTE_CANDIDATE = {
    "id": "1",
    "name": "Times Over Voted",
    "partyId": "0"
}

WRITEIN_CANDIDATE = {
    "id": "0",
    "name": "Write-in",
    "partyId": "0"
}

YESNO_CANDIDATES = [
    ## TODO
]

CVR_FIELDS = ["county_id", "precinct_id", "contest_id", "candidate_id"]
CANDIDATE_FIELDS = ["county_id", "contest_id", "candidate_id"]

# which precincts do candidates appear in
CONTEST_PRECINCTS_FIELDS = ["contest_id", "precinct_id"]

def find_contest(contests, contest_id):
    for c in contests:
        if c['type'] != 'ms-either-neither' and c['id'] == contest_id:
            return c
        if c['type'] == 'ms-either-neither' and c['eitherNeitherContestId'] == contest_id:
            return {"id": c['eitherNeitherContestId'],
                    "title": c['title'],
                    "options": c['eitherNeitherOptions']}
        if c['type'] == 'ms-either-neither' and c['pickOneContestId'] == contest_id:
            return {"id": c['pickOneContestId'],
                    "title": c["title"],
                    "options": c['pickOneOptions']}
    

def process_results_file(election_file_path, vx_results_file_path):
    election = json.loads(open(election_file_path,"r").read())
    contests = election["contests"]
    ballot_styles = election["ballotStyles"]
    precincts = election["precincts"]
    parties = election["parties"] + [NOPARTY_PARTY]

    county_id = election["county"]["id"]

    cvrs_file = open(vx_results_file_path, "r")
    
    db = sqlite3.connect(":memory:")
    c = db.cursor()

    # create data model for contests and candidates so that we can track all candidates that are supposed to be reported on
    sql = "create table candidates (%s)" % ",".join(CANDIDATE_FIELDS)
    c.execute(sql)

    # create data model for candidate precinct mappings
    sql = "create table contest_precincts (%s)" % ",".join(CONTEST_PRECINCTS_FIELDS)
    c.execute(sql)


    def add_candidate(contest_id, candidate_id):
        value_placeholders = ["?"] * len(CANDIDATE_FIELDS)
        sql = "insert into candidates values (%s)" % ",".join(value_placeholders)
        c.execute(sql, [county_id, contest_id, candidate_id])

    def add_contest_precinct(contest_id, precinct_id):
        sql = "insert into contest_precincts values (?,?)"
        c.execute(sql, [contest_id, precinct_id])
    
    for contest in contests:
        # identify the ballot styles where this contest appears
        contest_ballot_styles = [bs for bs in ballot_styles if contest["districtId"] in bs["districts"]]
        contest_precincts = set()
        for bs in contest_ballot_styles:
            contest_precincts.update(bs["precincts"])

        contest_precincts = list(contest_precincts)

        if contest["type"] == "ms-either-neither":
            for contest_id in [contest["eitherNeitherContestId"], contest["pickOneContestId"]]:
                for p in contest_precincts:
                    add_contest_precinct(contest_id, p)
                    
                # add the special candidates so they can be in the join
                add_candidate(contest_id, BLANKVOTE_CANDIDATE["id"])
                add_candidate(contest_id, OVERVOTE_CANDIDATE["id"])

            add_candidate(contest["eitherNeitherContestId"], contest["eitherOption"]["id"]) 
            add_candidate(contest["eitherNeitherContestId"], contest["neitherOption"]["id"])

            add_candidate(contest["pickOneContestId"], contest["firstOption"]["id"]) 
            add_candidate(contest["pickOneContestId"], contest["secondOption"]["id"])

            continue
        
        for p in contest_precincts:
            add_contest_precinct(contest["id"], p)
    
        # add the special candidates so they can be in the join
        add_candidate(contest["id"], BLANKVOTE_CANDIDATE["id"])
        add_candidate(contest["id"], OVERVOTE_CANDIDATE["id"])

        if contest["type"] == "yesno":
            # 2020-08-24 - we learned that measures actually have option IDs for SEMS
            # which we store here as candidate IDs.
            add_candidate(contest["id"], contest["yesOption"]["id"])
            add_candidate(contest["id"], contest["noOption"]["id"])            

        if contest["type"] == "candidate":
            for candidate in contest["candidates"]:
                add_candidate(contest["id"], candidate["id"])

            if contest["allowWriteIns"]:
                add_candidate(contest["id"], WRITEIN_CANDIDATE["id"])

    # create data model for CVRs
    sql = "create table CVRs (%s)" % ",".join(CVR_FIELDS)
    c.execute(sql)

    def add_entry(precinct_id, contest_id, answer):
        value_placeholders = ["?"] * len(CVR_FIELDS)
        sql = "insert into CVRs values (%s)" % ",".join(value_placeholders)
        c.execute(sql, [county_id, precinct_id, contest_id, answer])

    # insert CVRs
    while True:
        cvr = cvrs_file.readline()
        if not cvr:
            break
        
        cvr_obj = json.loads(cvr)
        precinct_id = cvr_obj["_precinctId"]

        for contest in contests:
            if contest['type'] == 'ms-either-neither':
                either_neither_contest_id = contest["eitherNeitherContestId"]
                pick_one_contest_id = contest["pickOneContestId"]

                either_neither_answer = cvr_obj.get(either_neither_contest_id, None)
                pick_one_answer = cvr_obj.get(pick_one_contest_id, None)

                # both of these should be present, otherwise it's an invalid CVR and we shouldn't count this contest at all
                if either_neither_answer == None or pick_one_answer == None:
                    continue

                # do the pick-one first, because its validity is self-contained
                pick_one_answer_valid = False
                if pick_one_answer == []:
                    add_entry(precinct_id, pick_one_contest_id, BLANKVOTE_CANDIDATE["id"])
                elif len(pick_one_answer) > 1:
                    add_entry(precinct_id, pick_one_contest_id, OVERVOTE_CANDIDATE["id"])
                else:
                    pick_one_answer_valid = True
                    option = contest["firstOption" if pick_one_answer == ["yes"] else "secondOption"]
                    add_entry(precinct_id,
                              pick_one_contest_id,
                              option["id"])

                # the validity of either-neither depends on the validity of pick-one.
                # as per Ms Either Neither rules, if no pick_one answer,
                # then the either_neither answer cannot be counted.
                if either_neither_answer == []:
                    add_entry(precinct_id, either_neither_contest_id, BLANKVOTE_CANDIDATE["id"])
                elif len(either_neither_answer) > 1:
                    add_entry(precinct_id, either_neither_contest_id, OVERVOTE_CANDIDATE["id"])
                elif either_neither_answer == ["no"] or pick_one_answer_valid:
                    option = contest["eitherOption" if either_neither_answer == ["yes"] else "neitherOption"]
                    
                    add_entry(precinct_id,
                              either_neither_contest_id,
                              option["id"])

                continue
            
            answers = cvr_obj.get(contest["id"], None)
            if answers != None:
                num_seats = contest["seats"] if contest['type'] == 'candidate' else 1

                # blank vote
                if len(answers) == 0:
                    add_entry(precinct_id, contest["id"], BLANKVOTE_CANDIDATE["id"])
                    continue

                # overvote & stop
                if len(answers) > num_seats:
                    add_entry(precinct_id, contest["id"], OVERVOTE_CANDIDATE["id"])
                    continue

                if contest['type'] == 'candidate':
                    for answer in answers:
                        if answer.startswith('__write-in') or answer.startswith('__writein') or answer.startswith('writein') or answer.startswith('write-in'):
                            add_entry(precinct_id, contest["id"], WRITEIN_CANDIDATE["id"])
                        else:
                            add_entry(precinct_id, contest["id"], answer)
                elif contest['type'] == 'yesno':
                    add_entry(precinct_id,
                              contest["id"],
                              contest["yesOption"]["id"] if answers == ["yes"] else contest["noOption"]["id"])

    # now it's all in in-memory sqlite
    sems_sql = """
    select contest_precincts.precinct_id, candidates.contest_id, candidates.candidate_id, CVRs.candidate_id, count(*) as count
    from candidates, contest_precincts
    left outer join CVRs
    on
    candidates.contest_id = CVRs.contest_id and candidates.candidate_id = CVRs.candidate_id and contest_precincts.precinct_id = CVRs.precinct_id
    where
    candidates.contest_id = contest_precincts.contest_id
    group by contest_precincts.precinct_id, candidates.contest_id, candidates.candidate_id, CVRs.candidate_id
    """

    sems_io = io.StringIO()
    
    # add the extra special candidates
    for contest in contests:
        if contest['type'] == "candidate":
            contest["options"] = contest["candidates"] + [BLANKVOTE_CANDIDATE, OVERVOTE_CANDIDATE, WRITEIN_CANDIDATE]
        if contest['type'] == "yesno":
            contest["options"] = [contest["yesOption"], contest["noOption"], BLANKVOTE_CANDIDATE, OVERVOTE_CANDIDATE]
        if contest['type'] == "ms-either-neither":
            contest["eitherNeitherOptions"]  = [contest["eitherOption"], contest["neitherOption"], BLANKVOTE_CANDIDATE, OVERVOTE_CANDIDATE]
            contest["pickOneOptions"]  = [contest["firstOption"], contest["secondOption"], BLANKVOTE_CANDIDATE, OVERVOTE_CANDIDATE]
        
    for row in c.execute(sems_sql).fetchall():
        precinct_id, contest_id, option_id, CVR_candidate_id, count = row
        
        contest = find_contest(contests, contest_id)
                   
        contest_party_id = contest["partyId"] if "partyId" in contest else None
        option = [o for o in contest["options"] if o["id"] == option_id][0]
        option_party_id = option["partyId"] if "partyId" in option else None
        
        contest_party = [p for p in parties if p["id"] == contest_party_id][0] if contest_party_id is not None else None
        option_party = [p for p in parties if p["id"] == option_party_id][0] if option_party_id is not None else None
        
        # this is the placeholder row
        if not CVR_candidate_id:
            count = 0
            
        # a whole rigamarole because SEMS needs a trailing comma
        row_bytesio = io.StringIO()
        sems_row_writer = csv.writer(row_bytesio, delimiter=',', quotechar='"', quoting=csv.QUOTE_ALL)
        sems_row_writer.writerow([
            county_id,
            precinct_id,
            contest_id,
            contest["title"].replace("\n", "\\n"),
            contest_party_id or "0",
            contest_party["abbrev"] if contest_party is not None else "NP",
            option_id,
            option.get("name", option.get("label")),
            option_party_id or "0",
            option_party["abbrev"] if option_party is not None else "NP",
            count
        ])
        
        sems_io.write(row_bytesio.getvalue().strip('\r\n'))
        sems_io.write(",\r\n")

    return sems_io.getvalue()
        

if __name__ == "__main__": # pragma: no cover this is the main
    sems_value = process_results_file(sys.argv[1], sys.argv[2])
    print(sems_value)

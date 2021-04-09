
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

UNDERVOTE_CANDIDATE = {
    "id": "2",
    "name": "Times Under Voted",
}
    
OVERVOTE_CANDIDATE = {
    "id": "1",
    "name": "Times Over Voted",
}

WRITEIN_CANDIDATE = {
    "id": "0",
    "name": "Write-in",
}

YESNO_CANDIDATES = [
    ## TODO
]

INTERNAL_WRITE_IN_ID = '__write-in'

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
                    "type": "yesno",
                    "yesOption": c['eitherOption'],
                    "noOption": c['neitherOption'],
                    "districtId": c['districtId'],
                    "options": c['eitherNeitherOptions'] if 'eitherNeitherOptions' in c else None}
        if c['type'] == 'ms-either-neither' and c['pickOneContestId'] == contest_id:
            return {"id": c['pickOneContestId'],
                    "title": c["title"],
                    "type": "yesno",
                    "yesOption": c['firstOption'],
                    "noOption": c['secondOption'],
                    "districtId": c['districtId'],
                    "options": c['pickOneOptions'] if 'pickOneOptions' in c else None}
    

def process_tallies_file(election_file_path, vx_results_file_path):
    election = json.loads(open(election_file_path, "r").read())
    tallies = json.loads(open(vx_results_file_path, "r").read())

    contests = election["contests"]
    ballot_styles = election["ballotStyles"]
    precincts = election["precincts"]
    parties = election["parties"] + [NOPARTY_PARTY]
    county_id = election["county"]["id"]
    tallies_by_precinct = tallies["talliesByPrecinct"]

    contests_by_precinct = {p["id"]: [] for p in precincts}
    for contest in contests:
        contest_ballot_styles = [bs for bs in ballot_styles if contest["districtId"] in bs["districts"]]
        contest_precincts = set()
        [contest_precincts.update(bs["precincts"]) for bs in contest_ballot_styles]
        for precinct in contest_precincts:
            if contest["type"] == "ms-either-neither":
                contests_by_precinct[precinct].append(contest["eitherNeitherContestId"])
                contests_by_precinct[precinct].append(contest["pickOneContestId"])
            else:
                contests_by_precinct[precinct].append(contest["id"])

    rows_to_write = []
    for precinct in sorted(precincts, key=lambda precinct: precinct["id"]):
        precinct_id = precinct["id"]
        contest_tallies = tallies_by_precinct[precinct_id] if precinct_id in tallies_by_precinct else {}
        contests_to_check = contests_by_precinct[precinct_id]
        for contest_id in sorted(contests_to_check):
            contest_tally = contest_tallies[contest_id] if contest_id in contest_tallies else {}
            contest = find_contest(contests, contest_id)
            
            contest_party_id = contest["partyId"] if "partyId" in contest else None
            contest_party = [p for p in parties if p["id"] == contest_party_id][0] if contest_party_id is not None else None

            rows_for_contest = []
            base_row_data = [
                county_id,
                precinct_id,
                contest_id,
                contest["title"].replace("\n", "\\n"),
                contest_party_id or "0",
                contest_party["abbrev"] if contest_party is not None else "NP"
            ]
            
            # Add undervote and overvote row from metadata
            metadata = contest_tally["metadata"] if "metadata" in contest_tally else {}
            overvotes_row = base_row_data.copy()
            overvotes_row.extend([
                OVERVOTE_CANDIDATE["id"],
                OVERVOTE_CANDIDATE["name"],
                "0",
                "NP",
                metadata["overvotes"] if "overvotes" in metadata else 0
            ])
            rows_for_contest.append(overvotes_row)
            undervotes_row = base_row_data.copy()
            undervotes_row.extend([
                UNDERVOTE_CANDIDATE["id"],
                UNDERVOTE_CANDIDATE["name"],
                "0",
                "NP",
                metadata["undervotes"] if "undervotes" in metadata else 0
            ])
            rows_for_contest.append(undervotes_row)

            option_tallies = contest_tally["tallies"] if "tallies" in contest_tally else {}
            if contest["type"] == "candidate":
                options = contest["candidates"].copy()
                if contest["allowWriteIns"]:
                    options.append(WRITEIN_CANDIDATE)
                for option in options:
                    if option == WRITEIN_CANDIDATE:
                        count = option_tallies[INTERNAL_WRITE_IN_ID] if INTERNAL_WRITE_IN_ID in option_tallies else 0
                    else:
                        count = option_tallies[option["id"]] if option["id"] in option_tallies else 0

                    option_party_id = option["partyId"] if "partyId" in option else None
                    option_party = [p for p in parties if p["id"] == option_party_id][0] if option_party_id is not None else None
                    candidate_row = base_row_data.copy()
                    candidate_row.extend([
                        option["id"],
                        option.get("name", option.get("label")),
                        option_party_id or "0",
                        option_party["abbrev"] if option_party is not None else "NP",
                        count
                    ])
                    rows_for_contest.append(candidate_row)

            elif contest["type"] == "yesno":
                # get ids for yes option and no option
                yes_option = contest["yesOption"]
                no_option = contest["noOption"]
                yes_count = option_tallies["yes"] if "yes" in option_tallies else 0
                no_count = option_tallies["no"] if "no" in option_tallies else 0
                yes_row = base_row_data.copy()
                yes_row.extend([
                    yes_option["id"],
                    yes_option.get("name", yes_option.get("label")),
                    "0",
                    "NP",
                    yes_count
                ])
                rows_for_contest.append(yes_row)

                no_row = base_row_data.copy()
                no_row.extend([
                    no_option["id"],
                    no_option.get("name", no_option.get("label")),
                    "0",
                    "NP",
                    no_count
                ])
                rows_for_contest.append(no_row)
            # Append rows sorted by candidate ID
            for row in sorted(rows_for_contest, key=lambda row: row[6]):
                rows_to_write.append(row)


    sems_io = io.StringIO()
    for row in rows_to_write:
        # a whole rigamarole because SEMS needs a trailing comma
        row_bytesio = io.StringIO()
        sems_row_writer = csv.writer(row_bytesio, delimiter=',', quotechar='"', quoting=csv.QUOTE_ALL)
        sems_row_writer.writerow(row)
    
        sems_io.write(row_bytesio.getvalue().strip('\r\n'))
        sems_io.write(",\r\n")

    return sems_io.getvalue()

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
                add_candidate(contest_id, UNDERVOTE_CANDIDATE["id"])
                add_candidate(contest_id, OVERVOTE_CANDIDATE["id"])

            add_candidate(contest["eitherNeitherContestId"], contest["eitherOption"]["id"]) 
            add_candidate(contest["eitherNeitherContestId"], contest["neitherOption"]["id"])

            add_candidate(contest["pickOneContestId"], contest["firstOption"]["id"]) 
            add_candidate(contest["pickOneContestId"], contest["secondOption"]["id"])

            continue
        
        for p in contest_precincts:
            add_contest_precinct(contest["id"], p)
    
        # add the special candidates so they can be in the join
        add_candidate(contest["id"], UNDERVOTE_CANDIDATE["id"])
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

                # either-neither tabulation is not what our reading of the Ms Constitution was.
                # both contained questions are tabulated as independent measures.
                if pick_one_answer == []:
                    add_entry(precinct_id, pick_one_contest_id, UNDERVOTE_CANDIDATE["id"])
                elif len(pick_one_answer) > 1:
                    add_entry(precinct_id, pick_one_contest_id, OVERVOTE_CANDIDATE["id"])
                else:
                    option = contest["firstOption" if pick_one_answer == ["yes"] else "secondOption"]
                    add_entry(precinct_id,
                              pick_one_contest_id,
                              option["id"])

                if either_neither_answer == []:
                    add_entry(precinct_id, either_neither_contest_id, UNDERVOTE_CANDIDATE["id"])
                elif len(either_neither_answer) > 1:
                    add_entry(precinct_id, either_neither_contest_id, OVERVOTE_CANDIDATE["id"])
                else:
                    option = contest["eitherOption" if either_neither_answer == ["yes"] else "neitherOption"]                    
                    add_entry(precinct_id,
                              either_neither_contest_id,
                              option["id"])

                continue
            
            answers = cvr_obj.get(contest["id"], None)
            if answers != None:
                num_seats = contest["seats"] if contest['type'] == 'candidate' else 1

                # under votes
                if len(answers) < num_seats:
                    # add an undervote for each vote less then the number of seats in the contest
                    for i in range(len(answers), num_seats):
                        add_entry(precinct_id, contest["id"], UNDERVOTE_CANDIDATE["id"])
                    # if there were no votes we're done otherwise we still have to tally the votes that happened
                    if len(answers) == 0:
                        continue

                # overvote & stop
                if len(answers) > num_seats:
                    # The number of overvotes is equal to the number of seats in the contest
                    for i in range(num_seats):
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
            contest["options"] = contest["candidates"] + [UNDERVOTE_CANDIDATE, OVERVOTE_CANDIDATE, WRITEIN_CANDIDATE]
        if contest['type'] == "yesno":
            contest["options"] = [contest["yesOption"], contest["noOption"], UNDERVOTE_CANDIDATE, OVERVOTE_CANDIDATE]
        if contest['type'] == "ms-either-neither":
            contest["eitherNeitherOptions"]  = [contest["eitherOption"], contest["neitherOption"], UNDERVOTE_CANDIDATE, OVERVOTE_CANDIDATE]
            contest["pickOneOptions"]  = [contest["firstOption"], contest["secondOption"], UNDERVOTE_CANDIDATE, OVERVOTE_CANDIDATE]
        
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


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
# APPROACH: we'll make a table of all field identiiers, leaving out denormalized labels,
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

        for p in contest_precincts:
            add_contest_precinct(contest["id"], p)
    
        if contest["type"] == "yesno": # pragma: no cover
            ## TODO: implement yesno measures
            continue

        for candidate in contest["candidates"]:
            add_candidate(contest["id"], candidate["id"])

        # add the special candidates so they can be in the join
        add_candidate(contest["id"], UNDERVOTE_CANDIDATE["id"])
        add_candidate(contest["id"], OVERVOTE_CANDIDATE["id"])
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
            answers = cvr_obj.get(contest["id"], None)
            if answers != None:
                # blank answer
                if answers == "":
                    add_entry(precinct_id, contest["id"], UNDERVOTE_CANDIDATE["id"])
                    continue

                # this condition has not been hit with a Ms sample file yet
                if len(answers) < contest["seats"]: # pragma: no cover
                    add_entry(precinct_id, contest["id"], UNDERVOTE_CANDIDATE["id"])
                    # keep going to count the candidates entered

                # overvote, record only the overvote fact
                # TODO: consider removing this since there are no overvotes in our system
                if len(answers) > contest["seats"]: # pragma: no cover
                    add_entry(precinct_id, contest["id"], OVERVOTE_CANDIDATE["id"])
                    continue
                
                for answer in answers:
                    if answer == '__write-in' or answer == 'writein':
                        add_entry(precinct_id, contest["id"], WRITEIN_CANDIDATE["id"])
                    else:
                        add_entry(precinct_id, contest["id"], answer)

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
        contest["candidates"] += [UNDERVOTE_CANDIDATE, OVERVOTE_CANDIDATE, WRITEIN_CANDIDATE]
        
    for row in c.execute(sems_sql).fetchall():
        precinct_id, contest_id, candidate_id, CVR_candidate_id, count = row
        
        contest = [c for c in contests if c["id"] == contest_id][0]
        contest_party_id = contest["partyId"] if "partyId" in contest else None
        candidate = [cand for cand in contest["candidates"] if cand["id"] == candidate_id][0]
        candidate_party_id = candidate["partyId"] if "partyId" in candidate else None

        contest_party = [p for p in parties if p["id"] == contest_party_id][0] if contest_party_id is not None else None
        candidate_party = [p for p in parties if p["id"] == candidate_party_id][0] if candidate_party_id is not None else None
        
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
            contest["title"],
            contest_party_id or "0",
            contest_party["abbrev"] if contest_party is not None else "NP",
            candidate_id,
            candidate["name"],
            candidate_party_id or "0",
            candidate_party["abbrev"] if candidate_party is not None else "NP",
            count
        ])
        
        sems_io.write(row_bytesio.getvalue().strip('\r\n'))
        sems_io.write(",\r\n")

    return sems_io.getvalue()
        



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
# python SEMSoutput.py election.json tallies.json
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

INTERNAL_WRITE_IN_ID = 'write-in'

CVR_FIELDS = ["county_id", "precinct_id", "contest_id", "candidate_id"]
CANDIDATE_FIELDS = ["county_id", "contest_id", "candidate_id"]

# which precincts do candidates appear in
CONTEST_PRECINCTS_FIELDS = ["contest_id", "precinct_id"]

def find_contest(contests, contest_id):
    for c in contests:
        if c['id'] == contest_id:
            return c

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

                    # for now, assume there is only one party per candidate
                    # if we later decide to support multiple parties per candidate, we'll need to change this
                    option_party_ids = option["partyIds"] if "partyIds" in option else []
                    assert len(option_party_ids) <= 1
                    option_party_id = option_party_ids[0] if len(option_party_ids) > 0 else None
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

if __name__ == "__main__": # pragma: no cover this is the main
    sems_value = process_tallies_file(sys.argv[1], sys.argv[2])
    print(sems_value)

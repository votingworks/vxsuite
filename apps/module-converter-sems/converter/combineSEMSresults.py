
#
# Combine two SEMS results files
#
# This is used for combining results files from Vx and another vendor into a single file.
# The reason for this script is that, in SEMS, the last upload overwrites all.
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
# The primary key on these rows is (county_id, precinct_id, contest_id, candidate_id)
# The count field is the key fact.
# The remaining fields are derived: contest_title, party_id, party_label, candidate_name, candidate_party_id, candidate_party_label.
#
# This script takes three file paths:
# - the first file to combine
# - the second file to combine
# - the path of the output file
#
# For derived field values, it uses the first file and ignores the second file.
#
# The only thing this script does, then, is effectively sum up the corresponding count fields.
#
# IMPLEMENTATION: insert all the data into an in-memory database, then use SQL aggregates to combine.
#

import csv, io, sqlite3, sys

SEMS_FIELDS = ['county_id', 'precinct_id', 'contest_id', 'contest_title', 'party_id', 'party_label', 'candidate_id', 'candidate_name', 'candidate_party_id', 'candidate_party_label']
COUNT_FIELD = 'count'
FILENAME_FIELD = 'filename'

RESULT_INSERT_ROW_SQL = "insert into results values (%s)" % ",".join(["?"] * (len(SEMS_FIELDS) + 2))

OUTPUT_SQL = "select county_id, precinct_id, contest_id, min(contest_title) as contest_title, min(party_id) as party_id, min(party_label) as party_label, candidate_id, min(candidate_name) as candidate_name, min(candidate_party_id) as candidate_party_id, min(candidate_party_label) as candidate_party_label, sum(count) as count from results group by county_id, precinct_id, contest_id, candidate_id"

def create_data_model(cursor):
    fields_with_types = [(f, 'varchar') for f in SEMS_FIELDS]
    fields_with_types += [(COUNT_FIELD, 'integer')]
    fields_with_types += [(FILENAME_FIELD, 'varchar')]

    fields_with_types_string = ["%s %s" % (field[0], field[1]) for field in fields_with_types]
    sql = "create table results (%s)" % ", ".join(fields_with_types_string)

    cursor.execute(sql)

def load_one_row(cursor, filepath, row):
    if len(row) == 0:
        return

    # strip the last value cause trailing comma
    row = row[:-1]

    cursor.execute(RESULT_INSERT_ROW_SQL, row + [filepath])

def load_file(cursor, filepath):
    the_file = open(filepath, "r")
    the_rows = csv.reader(the_file)

    for row in the_rows:
        load_one_row(cursor, filepath, row)

def output_to_file(cursor, filepath):
    combined_results = cursor.execute(OUTPUT_SQL).fetchall()

    sems_io = open(filepath, "w")

    for row in combined_results:
        row_bytesio = io.StringIO()
        sems_row_writer = csv.writer(row_bytesio, delimiter=',', quotechar='"', quoting=csv.QUOTE_ALL)
        sems_row_writer.writerow(row)

        sems_io.write(row_bytesio.getvalue().strip('\r\n'))
        sems_io.write(",\r\n")

    sems_io.close()

def main(input1_path, input2_path, output_path):
    db = sqlite3.connect(":memory:")
    cursor = db.cursor()
    create_data_model(cursor)

    load_file(cursor, input1_path)
    load_file(cursor, input2_path)
    output_to_file(cursor, output_path)

if __name__ == "__main__": # pragma: no cover this is the main
    main(sys.argv[1], sys.argv[2], sys.argv[3])

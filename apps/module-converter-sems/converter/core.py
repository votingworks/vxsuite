
import json, os

from flask import Flask, send_from_directory, send_file, request
from werkzeug.utils import secure_filename

from . import SEMSinput
from . import SEMSoutput

# directory for all files
FILES_DIR = os.path.join(os.path.dirname(os.path.realpath(__file__)), '..', 'election_files')

VX_FILENAMES = {
    "election": "vx-election.json",
    "result": "vx-results.txt"
}

# paths for the Vx files, the election.json and the VX results file.
VX_FILES = {
    "election" : None,
    "result" : None
}

ALLOWED_EXTENSIONS = set(['txt', 'csv'])

app = Flask(__name__)

# paths
ELECTION_FILES = {
    "inputFiles": [
        {"name": "SEMS main file", "path": None},
        {"name": "SEMS candidate mapping file", "path": None}
    ],
    "outputFiles": [
        {"name": "Vx Election Definition", "path": None}
    ]
}

# paths
RESULTS_FILES = {
    "inputFiles": [
        {"name": "Vx Election Definition", "path": None},
        {"name": "Vx CVRs", "path": None}
    ],
    "outputFiles": [
        {"name": "SEMS Results", "path": None}
    ]
}

def find_by_name(lst_of_obj, name):
    if not lst_of_obj:
        return None
    for obj in lst_of_obj:
        if obj['name'] == name:
            return obj

    return None

@app.route('/convert/election/files', methods=["GET"])
def election_filelist():
    return json.dumps(ELECTION_FILES)

@app.route('/convert/results/files', methods=["GET"])
def results_filelist():
    return json.dumps(RESULTS_FILES)

def submitfile(request, file_list):
    the_file = request.files['file']
    the_name = request.form['name']

    the_entry = find_by_name(file_list['inputFiles'], the_name)
    if the_entry:
        the_path = os.path.join(FILES_DIR, the_name)
        the_file.save(the_path)
        the_entry['path'] = the_path

@app.route('/convert/election/submitfile', methods=["POST"])
def election_submitfile():
    submitfile(request, ELECTION_FILES)
    return json.dumps({"status": "ok"})

@app.route('/convert/results/submitfile', methods=["POST"])
def results_submitfile():
    submitfile(request, RESULTS_FILES)
    return json.dumps({"status": "ok"})

@app.route('/convert/election/process', methods=["POST"])
def election_process():
    for f in ELECTION_FILES['inputFiles']:
        if not f['path']:
            return json.dumps({"status": "not all files are ready to process"})

    input_files = ELECTION_FILES['inputFiles']
    vx_election = SEMSinput.process_election_files(
        find_by_name(input_files, 'SEMS main file')['path'],
        find_by_name(input_files, 'SEMS candidate mapping file')['path']
    )

    file_name = 'Vx Election Definition'
    the_path = os.path.join(FILES_DIR, file_name)
    vx_file = open(the_path, "w")
    vx_file.write(json.dumps(vx_election, indent=2))
    vx_file.close()

    the_output_file = find_by_name(ELECTION_FILES['outputFiles'], file_name)
    the_output_file['path']= the_path
    
    return json.dumps({"status": "ok"})

@app.route('/convert/election/output', methods=["GET"])
def election_output():
    the_name = request.args.get('name', None)
    the_entry = find_by_name(ELECTION_FILES['outputFiles'], the_name)

    if the_entry and the_entry['path']:
        return send_file(the_entry['path'])
    else:
        return "", 404

@app.route('/convert/results/process', methods=["POST"])
def results_process():
    for f in RESULTS_FILES['inputFiles']:
        if not f['path']:
            return json.dumps({"status": "not all files are ready to process"})

    sems_result = SEMSoutput.process_results_file(
        "53",
        find_by_name(RESULTS_FILES['inputFiles'], 'Vx Election Definition')['path'],
        find_by_name(RESULTS_FILES['inputFiles'], 'Vx CVRs')['path']
    )
    the_path = os.path.join(FILES_DIR, 'SEMS Results')
    result_file = open(the_path, "w")
    result_file.write(sems_result)
    result_file.close()

    find_by_name(RESULTS_FILES['outputFiles'], 'SEMS Results')['path'] = the_path

    return json.dumps({"status": "ok"})
    
    
@app.route('/convert/results/output', methods=["GET"])
def results_output():
    the_name = request.args.get('name', None)
    the_entry = find_by_name(RESULTS_FILES['outputFiles'], the_name)

    print(the_entry)
    print(RESULTS_FILES)
    if the_entry and the_entry['path']:
        return send_file(the_entry['path'])
    else:
        return "", 404

@app.route('/')
def index_test(): # pragma: no cover this is just for testing
    return send_from_directory(os.path.join(os.path.dirname(os.path.realpath(__file__)), '..'), 'index.html')

def reset():
    for category in [ELECTION_FILES, RESULTS_FILES]:
        for file_list in [category['inputFiles'], category['outputFiles']]:
            for f in file_list:
                f['path'] = None

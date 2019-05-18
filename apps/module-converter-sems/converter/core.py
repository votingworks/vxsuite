
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
    "SEMS main file": None,
    "SEMS candidate mapping file": None
}

# paths
RESULTS_FILES = {
    "SEMS results": None
}

@app.route('/convert/election/filelist', methods=["GET"])
def election_filelist():
    return json.dumps(ELECTION_FILES)

@app.route('/convert/results/filelist', methods=["GET"])
def results_filelist():
    return json.dumps(RESULTS_FILES)

@app.route('/convert/election/submitfile', methods=["POST"])
def election_submitfile():
    print("YOOOOO", request.files.get('file'))
    the_file = request.files['file']
    print(the_file)
    the_name = request.form['name']
    if the_name in ELECTION_FILES:
        the_path = os.path.join(FILES_DIR, the_name)
        the_file.save(the_path)
        ELECTION_FILES[the_name] = the_path
    return json.dumps({"status": "ok"})

@app.route('/convert/results/submitfile', methods=["POST"])
def results_submitfile():
    the_file = request.files['file']
    the_path = os.path.join(FILES_DIR, 'vx-results.txt')
    the_file.save(the_path)
    VX_FILES["result"] = the_path
    return json.dumps({"status": "ok"})

@app.route('/convert/election/process', methods=["POST"])
def election_process():
    for f in ELECTION_FILES.keys():
        if not ELECTION_FILES[f]:
            return json.dumps({"status": "not all files are ready to process"})

    vx_election = SEMSinput.process_election_files(ELECTION_FILES['SEMS main file'], ELECTION_FILES['SEMS candidate mapping file'])
    the_path = os.path.join(FILES_DIR, VX_FILENAMES['election'])
    vx_file = open(the_path, "w")
    vx_file.write(json.dumps(vx_election, indent=2))
    vx_file.close()

    VX_FILES["election"] = the_path
    
    return json.dumps({"status": "ok"})

@app.route('/convert/results/process', methods=["POST"])
def results_process():
    for f in VX_FILES.keys():
        if not VX_FILES[f]:
            return json.dumps({"status": "not all files are ready to process"})

    sems_result = SEMSoutput.process_results_file("53", VX_FILES['election'], VX_FILES['result'])
    the_path = os.path.join(FILES_DIR, 'SEMS result')
    result_file = open(the_path, "w")
    result_file.write(sems_result)
    result_file.close()

    RESULTS_FILES['SEMS result'] = the_path

    return json.dumps({"status": "ok"})
    
    
@app.route('/convert/election/output', methods=["GET"])
def election_output():
    election_file = VX_FILES["election"]
    if election_file:
        return send_file(election_file)
    else:
        return "", 404

@app.route('/convert/results/output', methods=["GET"])
def results_output():
    the_name = request.args.get('name', None)
    if the_name and RESULTS_FILES.get(the_name, None):
        return send_file(RESULTS_FILES[the_name])
    else:
        return "", 404

@app.route('/')
def index_test(): # pragma: no cover this is just for testing
    return send_from_directory(os.path.join(os.path.dirname(os.path.realpath(__file__)), '..'), 'index.html')

def reset():
    for d in [VX_FILES, ELECTION_FILES, RESULTS_FILES]:
        for k in d.keys():
            d[k] = None

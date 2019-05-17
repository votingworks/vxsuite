
import json, os

from flask import Flask, send_from_directory, send_file, request
from werkzeug.utils import secure_filename

# directory for all files
FILES_DIR = os.path.join(os.path.dirname(os.path.realpath(__file__)), '..', 'election_files')

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
    the_file = request.files['file']
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
    return json.dumps({})

@app.route('/convert/results/process', methods=["POST"])
def results_process():
    return json.dumps({})

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

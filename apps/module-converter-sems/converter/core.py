
import json, os

from flask import Flask, send_from_directory, request

app = Flask(__name__)

ELECTION_FILES = {
    "main file": None,
    "candidate mapping file": None
}

RESULT_FILES = {
    "results": None
}

@app.route('/convert/election/filelist', methods=["GET"])
def election_filelist():
    return json.dumps(ELECTION_FILES)

@app.route('/convert/results/filelist', methods=["GET"])
def results_filelist():
    return json.dumps(RESULT_FILES)

@app.route('/convert/election/submitfile', methods=["POST"])
def election_submitfile():
    return json.dumps({})

@app.route('/convert/results/submitfile', methods=["POST"])
def results_submitfile():
    return json.dumps({})

@app.route('/convert/election/process', methods=["POST"])
def election_process():
    return json.dumps({})

@app.route('/convert/results/process', methods=["POST"])
def results_process():
    return json.dumps({})

@app.route('/convert/election/output', methods=["GET"])
def election_output():
    return json.dumps({})

@app.route('/convert/results/output', methods=["GET"])
def results_output():
    return json.dumps({})

@app.route('/')
def index_test(): # pragma: no cover this is just for testing
    return send_from_directory(os.path.join(os.path.dirname(os.path.realpath(__file__)), '..'), 'index.html')

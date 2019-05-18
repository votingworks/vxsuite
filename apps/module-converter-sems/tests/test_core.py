
from unittest.mock import patch

import pytest, json, io, os

from converter.core import app, reset

PARENT_DIR = os.path.join(os.path.dirname(os.path.realpath(__file__)), '..')
ELECTION_FILES = os.path.join(PARENT_DIR, 'election_files')
SAMPLE_FILES = os.path.join(PARENT_DIR, 'sample_files')
SAMPLE_MAIN_FILE = os.path.join(SAMPLE_FILES, '53_5-2-2019.txt')
SAMPLE_CANDIDATE_MAPPING_FILE = os.path.join(SAMPLE_FILES, '53_CANDMAP_5-2-2019.txt')
EXPECTED_ELECTION_FILE = os.path.join(SAMPLE_FILES, 'expected-election.json')

SAMPLE_CVRS_FILE = os.path.join(SAMPLE_FILES, "CVRs.txt")
EXPECTED_RESULTS_FILE = os.path.join(SAMPLE_FILES, '53_Results.txt')

def upload_file(client, url, filepath, extra_params={}):
    data = extra_params
    data['file'] = open(filepath,"rb")
    return client.post(
        url,
        data=data,
        content_type="multipart/form-data"
    )
    

@pytest.fixture
def client():
    reset()
    app.config['TESTING'] = True
    client = app.test_client()

    yield client

    # any cleanup goes here

def test_election_filelist(client):
    rv = json.loads(client.get('/convert/election/filelist').data)
    assert 'SEMS main file' in rv
    assert 'SEMS candidate mapping file' in rv

def test_results_filelist(client):
    rv = json.loads(client.get('/convert/results/filelist').data)
    assert 'SEMS results' in rv

def test_election_submitfile(client):
    upload_file(client, '/convert/election/submitfile', SAMPLE_MAIN_FILE, {
        'name': 'SEMS main file'
    })

    # check the file got there
    filelist = json.loads(client.get('/convert/election/filelist').data)
    print(filelist)
    assert filelist['SEMS main file']

def test_results_submitfile(client):
    the_path = "./election_files/vx-results.txt"
    if os.path.exists(the_path):
        os.remove(the_path)

    # TODO: real results file
    upload_file(client, '/convert/results/submitfile', SAMPLE_MAIN_FILE, {
        'name': 'VX result'
    })

    # check the file got there
    assert os.path.exists(the_path)

def test_election_process(client):
    # upload the sample files
    upload_file(client, '/convert/election/submitfile', SAMPLE_MAIN_FILE, {'name': 'SEMS main file'})

    # try to process before ready
    rv = client.post('/convert/election/process').data
    assert b"not all files" in rv    
    
    upload_file(client, '/convert/election/submitfile', SAMPLE_CANDIDATE_MAPPING_FILE, {'name': 'SEMS candidate mapping file'})

    # process
    client.post('/convert/election/process')

    # download and check that it's the right file
    election = json.loads(client.get('/convert/election/output').data)
    expected_election = json.loads(open(EXPECTED_ELECTION_FILE, "r").read())

    assert election == expected_election
    
def test_results_process(client):
    # get the election.json generated
    upload_file(client, '/convert/election/submitfile', SAMPLE_MAIN_FILE, {'name': 'SEMS main file'})
    upload_file(client, '/convert/election/submitfile', SAMPLE_CANDIDATE_MAPPING_FILE, {'name': 'SEMS candidate mapping file'})
    client.post("/convert/election/process")

    rv = client.post("/convert/results/process").data
    assert b"not all files" in rv
    
    upload_file(client, '/convert/results/submitfile', SAMPLE_CVRS_FILE, {'name': 'results'})

    client.post("/convert/results/process")
    
    # download and check that it's the right file
    results = client.get('/convert/results/output?name=SEMS%20result').data
    expected_results = open(EXPECTED_RESULTS_FILE, "r").read()

    assert results == expected_results.encode('utf-8')

def test_election_output(client):
    the_path = os.path.join(ELECTION_FILES, "election.json")
    f = open(the_path,"w")
    f.write("yoyoyo")
    f.close()

    # before pointer is set
    rv = client.get('/convert/election/output')
    assert rv.status == "404 NOT FOUND"
    
    import converter.core
    converter.core.VX_FILES["election"] = the_path
    
    rv = client.get('/convert/election/output').data
    assert rv == b"yoyoyo"

def test_results_output(client):
    the_path = os.path.join(ELECTION_FILES, "SEMS results")
    f = open(the_path,"w")
    f.write("yoyoyo2")
    f.close()

    url = '/convert/results/output?name=SEMS%20results'
    # before pointer is set
    rv = client.get(url)
    assert rv.status == "404 NOT FOUND"
    
    import converter.core
    converter.core.RESULTS_FILES["SEMS results"] = the_path
    
    rv = client.get(url).data
    assert rv == b"yoyoyo2"


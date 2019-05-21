
from unittest.mock import patch

import pytest, json, io, os

from converter.core import app, reset

PARENT_DIR = os.path.join(os.path.dirname(os.path.realpath(__file__)), '..')
FILES_DIR = os.path.join(PARENT_DIR, 'election_files')
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

def test_election_files(client):
    rv = json.loads(client.get('/convert/election/files').data)
    assert 'inputFiles' in rv
    assert 'outputFiles' in rv

def test_results_filelist(client):
    rv = json.loads(client.get('/convert/results/files').data)
    assert 'inputFiles' in rv
    assert 'outputFiles' in rv

def test_election_submitfile(client):
    upload_file(client, '/convert/election/submitfile', SAMPLE_MAIN_FILE, {
        'name': 'SEMS main file'
    })

    # check the file got there
    filelist = json.loads(client.get('/convert/election/files').data)
    assert filelist['inputFiles'][0]['name'] == 'SEMS main file'

def test_results_submitfile(client):
    reset()

    upload_file(client, '/convert/results/submitfile', EXPECTED_ELECTION_FILE, {
        'name': 'Vx Election Definition'
    })

    upload_file(client, '/convert/results/submitfile', SAMPLE_CVRS_FILE, {
        'name': 'Vx CVRs'
    })
    
    # check the file got there
    filelist = json.loads(client.get('/convert/results/files').data)
    assert filelist['inputFiles'][0]['path']    
    assert filelist['inputFiles'][1]['path']
    
def test_election_process(client):
    reset()
    
    # upload the sample files
    upload_file(client, '/convert/election/submitfile', SAMPLE_MAIN_FILE, {'name': 'SEMS main file'})

    # try to process before ready
    rv = client.post('/convert/election/process').data
    assert b"not all files" in rv
    
    upload_file(client, '/convert/election/submitfile', SAMPLE_CANDIDATE_MAPPING_FILE, {'name': 'SEMS candidate mapping file'})

    # process
    client.post('/convert/election/process')

    # download and check that it's the right file
    election = json.loads(client.get('/convert/election/output?name=Vx%20Election%20Definition').data)
    expected_election = json.loads(open(EXPECTED_ELECTION_FILE, "r").read())

    assert election == expected_election
    
def test_results_process(client):
    reset()
    
    upload_file(client, '/convert/results/submitfile', EXPECTED_ELECTION_FILE, {'name': 'Vx Election Definition'})

    rv = client.post("/convert/results/process").data
    assert b"not all files" in rv
    
    upload_file(client, '/convert/results/submitfile', SAMPLE_CVRS_FILE, {'name': 'Vx CVRs'})
    rv = client.post("/convert/results/process").data
    assert json.loads(rv) == {"status": "ok"}
    
    # download and check that it's the right file
    results = client.get('/convert/results/output?name=SEMS%20Results').data
    expected_results = open(EXPECTED_RESULTS_FILE, "r").read()

    assert results == expected_results.encode('utf-8')


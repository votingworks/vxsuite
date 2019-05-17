
from unittest.mock import patch

import pytest, json, io, os

from converter.core import app

ELECTION_FILES = os.path.join(os.path.dirname(os.path.realpath(__file__)), '..', 'election_files')

@pytest.fixture
def client():
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
    data = {
        'name': 'SEMS main file',
        'file': (io.BytesIO(b"abcdef"), 'foo.txt')
    }
    client.post(
        '/convert/election/submitfile',
        data=data,
        content_type="multipart/form-data"
    )

    # check the file got there
    filelist = json.loads(client.get('/convert/election/filelist').data)
    assert filelist['SEMS main file']

def test_results_submitfile(client):
    the_path = "./election_files/vx-results.txt"
    if os.path.exists(the_path):
        os.remove(the_path)
    
    data = {
        'name': 'VX result',
        'file': (io.BytesIO(b"abcdef"), 'foo.txt')
    }
    client.post(
        '/convert/results/submitfile',
        data=data,
        content_type="multipart/form-data"
    )

    # check the file got there
    assert os.path.exists(the_path)

def test_election_process(client):
    client.post('/convert/election/process')
    
def test_results_process(client):
    client.post('/convert/results/process')

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


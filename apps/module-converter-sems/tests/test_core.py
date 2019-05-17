
from unittest.mock import patch

import pytest, json

from converter.core import app

@pytest.fixture
def client():
    app.config['TESTING'] = True
    client = app.test_client()

    yield client

    # any cleanup goes here

def test_election_filelist(client):
    rv = json.loads(client.get('/convert/election/filelist').data)
    assert 'main file' in rv
    assert 'candidate mapping file' in rv

def test_results_filelist(client):
    rv = json.loads(client.get('/convert/results/filelist').data)
    assert 'results' in rv

def test_election_submitfile(client):
    client.post('/convert/election/submitfile')

def test_results_submitfile(client):
    client.post('/convert/results/submitfile')

def test_election_process(client):
    client.post('/convert/election/process')
    
def test_results_process(client):
    client.post('/convert/results/process')

def test_election_output(client):
    client.get('/convert/election/output')

def test_results_output(client):
    client.get('/convert/results/output')

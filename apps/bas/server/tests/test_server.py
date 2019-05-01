
from basserver.core import app

import pytest

@pytest.fixture
def client():
    app.config['TESTING'] = True
    client = app.test_client()

    yield client

    # any cleanup goes here

def test_index(client):
    index_page = client.get("/")
    assert b'VotingWorks Ballot Activation System' in index_page.data

def test_manifest(client):
    manifest_page = client.get("/manifest.json")
    assert b'"short_name"' in manifest_page.data


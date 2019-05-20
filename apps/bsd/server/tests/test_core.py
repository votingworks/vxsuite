
from basserver.core import app

from unittest.mock import patch

import pytest, json

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

@patch('basserver.card.CardInterface.write', return_value=True)
def test_card_write(MockCardInterfaceWrite, client):
    rv = json.loads(client.post("/card/write",data=json.dumps({"code":"test"}),content_type='application/json').data)
    assert rv['success']

def test_card_write_no_cardreader(client):
    rv = json.loads(client.post("/card/write",data=json.dumps({"code":"test"}),content_type='application/json').data)
    assert not rv['success']


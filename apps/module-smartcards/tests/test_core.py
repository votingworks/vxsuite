
from smartcards.core import app

from unittest.mock import patch

import pytest, json

@pytest.fixture
def client():
    app.config['TESTING'] = True
    client = app.test_client()

    yield client

    # any cleanup goes here

@patch('smartcards.card.CardInterface.read', return_value=[b"XYZ", False])
@patch('smartcards.card.CardInterface.read_long', return_value=None)
def test_card_read(MockCardInterfaceReadLong, MockCardInterfaceRead, client):
    rv = json.loads(client.get("/card/read").data)
    assert rv['present']
    assert rv['shortValue'] == 'XYZ'
    assert not rv['longValueExists']
    assert MockCardInterfaceRead.called

    rv = json.loads(client.get("/card/read_long").data)
    assert rv == {}
    assert MockCardInterfaceReadLong.called

@patch('smartcards.card.CardInterface.read', return_value=[b'', False])
def test_card_read_badcard(MockCardInterfaceRead, client):
    rv = json.loads(client.get("/card/read").data)
    assert rv['present']
    assert 'shortValue' not in rv
    assert MockCardInterfaceRead.called

def test_card_read_no_cardreader(client):
    rv = json.loads(client.get("/card/read").data)
    assert rv['present'] == False

@patch('smartcards.card.CardInterface.read', return_value=[b"XYZ", True])
@patch('smartcards.card.CardInterface.read_long', return_value=b"Hello 1 2 3")
def test_card_read_long(MockCardInterfaceReadLong, MockCardInterfaceRead, client):
    rv = json.loads(client.get("/card/read").data)
    assert rv['present']
    assert rv['shortValue'] == 'XYZ'
    assert rv['longValueExists']
    assert MockCardInterfaceRead.called

    rv = json.loads(client.get("/card/read_long").data)
    assert rv['longValue'] == 'Hello 1 2 3'
    assert MockCardInterfaceReadLong.called

@patch('smartcards.card.CardInterface.write', return_value=True)
def test_card_write(MockCardInterfaceWrite, client):
    rv = json.loads(client.post("/card/write",data=json.dumps({"code":"test"}),content_type='application/json').data)
    assert rv['success']

def test_card_write_no_cardreader(client):
    rv = json.loads(client.post("/card/write",data=json.dumps({"code":"test"}),content_type='application/json').data)
    assert not rv['success']



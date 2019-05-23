
from smartcards.core import app
import smartcards.core

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

@patch('smartcards.card.CardInterface.read', return_value=[None, False])
def test_card_read_nocard(MockCardInterfaceRead, client):
    rv = json.loads(client.get("/card/read").data)
    assert not rv['present']
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

@patch('smartcards.card.CardInterface.write_short_and_long', return_value=True)
def test_card_write_short_and_long(MockCardInterfaceWrite, client):
    data = {"short_value": "blah blah", "long_value": "blue blue"}
    rv = json.loads(client.post("/card/write_short_and_long",data=data).data)
    assert rv['success']
    
def test_card_write_no_cardreader(client):
    rv = json.loads(client.post("/card/write",data=json.dumps({"code":"test"}),content_type='application/json').data)
    assert not rv['success']


def test_mock_card_read(client):
    smartcards.core.mock_short_value=b'XYZ'
    smartcards.core.mock_long_value=b'yeehah'
    rv = json.loads(client.get("/card/read").data)
    assert rv['present']
    assert rv['shortValue'] == 'XYZ'
    assert rv['longValueExists']

    rv = json.loads(client.get("/card/read_long").data)
    assert rv == {'longValue': 'yeehah'}
    smartcards.core.mock_short_value=None
    smartcards.core.mock_long_value=None    



from smartcards.core import app

from unittest.mock import patch

import pytest, json

@pytest.fixture
def client():
    app.config['TESTING'] = True
    client = app.test_client()

    yield client

    # any cleanup goes here

@patch('smartcards.card.CardInterface.read', return_value="XYZ")
def test_card_read(MockCardInterfaceRead, client):
    rv = json.loads(client.get("/card/read").data)
    assert rv['card'] == "XYZ"
    assert MockCardInterfaceRead.called

def test_card_read_no_cardreader(client):
    rv = json.loads(client.get("/card/read").data)
    assert rv.get('card', None) is None

@patch('smartcards.card.CardInterface.write', return_value=True)
def test_card_write(MockCardInterfaceWrite, client):
    rv = json.loads(client.post("/card/write",data=json.dumps({"code":"test"}),content_type='application/json').data)
    assert rv['success']

def test_card_write_no_cardreader(client):
    rv = json.loads(client.post("/card/write",data=json.dumps({"code":"test"}),content_type='application/json').data)
    assert not rv['success']




from smartcards.core import app
import smartcards.core

from unittest.mock import patch

import pytest
import json
import secrets
import base64


@pytest.fixture
def client():
    app.config['TESTING'] = True
    client = app.test_client()

    # reset card mock
    client.put('/mock', data=json.dumps({
        'enabled': True,
        'hasCard': False
    }))

    yield client

    # any cleanup goes here


def test_card_read(client):
    client.put('/mock', data=json.dumps({'shortValue': 'XYZ'}))

    rv = json.loads(client.get("/card/read").data)
    assert rv['present']
    assert rv['shortValue'] == 'XYZ'
    assert not rv['longValueExists']

    rv = json.loads(client.get("/card/read_long").data)
    assert rv == {}


def test_card_read_badcard(client):
    client.put('/mock', data=json.dumps({'shortValue': ''}))

    rv = json.loads(client.get("/card/read").data)
    assert rv['present']
    assert 'shortValue' not in rv


def test_card_read_nocard(client):
    client.put('/mock', data=json.dumps({'shortValue': None}))

    rv = json.loads(client.get("/card/read").data)
    assert not rv['present']
    assert 'shortValue' not in rv


def test_card_read_no_cardreader(client):
    rv = json.loads(client.get("/card/read").data)
    assert rv['present'] == False


def test_card_read_long(client):
    client.put(
        '/mock', data=json.dumps({'shortValue': 'XYZ', 'longValue': 'Hello 1 2 3'}))

    rv = json.loads(client.get("/card/read").data)
    assert rv['present']
    assert rv['shortValue'] == 'XYZ'
    assert rv['longValueExists']

    rv = json.loads(client.get("/card/read_long").data)
    assert rv['longValue'] == 'Hello 1 2 3'


def test_card_write(client):
    client.put('/mock', data=json.dumps({'enabled': True}))

    rv = json.loads(client.post(
        "/card/write", data=json.dumps({"code": "test"}), content_type='application/json').data)
    assert rv['success']


def test_card_write_long_b64(client):
    client.put('/mock', data=json.dumps({'enabled': True}))

    random_bytes = secrets.token_bytes(1000)
    stuff = client.post("/card/write_long_b64",
                        data={"long_value": base64.b64encode(random_bytes).decode('ascii')}).data
    rv = json.loads(stuff)
    assert rv['success']


def test_card_read_long_b64(client):
    long_value = base64.b64encode(secrets.token_bytes(1000)).decode('ascii')
    client.put('/mock', data=json.dumps({'longValueB64': long_value}))

    rv = json.loads(client.get("/card/read_long_b64").data)
    assert rv['longValue'] == long_value


def test_card_read_long_b64_empty(client):
    client.put('/mock', data=json.dumps({'enabled': True}))

    rv = json.loads(client.get("/card/read_long_b64").data)
    assert 'longValue' in rv
    assert not rv['longValue']


def test_card_write_and_protect(client):
    client.put('/mock', data=json.dumps({'enabled': True}))

    rv = json.loads(client.post("/card/write_and_protect",
                                data=json.dumps({"code": "test"}), content_type='application/json').data)
    assert rv['success']

    rv = json.loads(client.get("/mock").data)
    assert rv['writeProtected']
    assert base64.b64decode(rv['shortValueB64']).decode(
        'utf-8') == json.dumps({"code": "test"})


def test_card_write_short_and_long(client):
    client.put('/mock', data=json.dumps({'enabled': True}))

    data = {"short_value": "blah blah", "long_value": "blue blue"}
    rv = json.loads(client.post("/card/write_short_and_long", data=data).data)
    assert rv['success']

    rv = json.loads(client.get("/mock").data)
    assert base64.b64decode(rv['shortValueB64']).decode('utf-8') == 'blah blah'
    assert base64.b64decode(rv['longValueB64']).decode('utf-8') == 'blue blue'


def test_card_write_protect_override(client):
    client.put(
        '/mock', data=json.dumps({'enabled': True, 'writeProtected': True}))

    rv = json.loads(client.post("/card/write_protect_override").data)
    assert rv['success']

    rv = json.loads(client.get("/mock").data)
    assert not rv['writeProtected']


def test_card_write_no_cardreader(client):
    client.put('/mock', data=json.dumps({'enabled': True, 'hasCard': False}))

    rv = json.loads(client.post(
        "/card/write", data=json.dumps({"code": "test"}), content_type='application/json').data)
    assert not rv['success']


def test_mock_card_read_and_write(client):
    client.put(
        '/mock', data=json.dumps({'shortValue': 'XYZ', 'longValue': 'yeehah'}))

    print(client.get('/mock'))

    rv = json.loads(client.get("/card/read").data)
    assert rv['present']
    assert rv['shortValue'] == 'XYZ'
    assert rv['longValueExists']

    rv = json.loads(client.get("/card/read_long").data)
    assert rv == {'longValue': 'yeehah'}

    client.post("/card/write", data="oy")
    rv = client.get("/card/read")
    assert json.loads(rv.data)['shortValue'] == "oy"

    smartcards.core.mock_short_value = None
    smartcards.core.mock_long_value = None

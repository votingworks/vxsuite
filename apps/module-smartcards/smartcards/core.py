
import json, os

from flask import Flask, send_from_directory, request

from smartcard.System import readers
from smartcard.util import toHexString, toASCIIBytes, toASCIIString

from .card import CardInterface

app = Flask(__name__)

mock_short_value = os.environ.get("MOCK_SHORT_VALUE", None)
mock_long_value_file = os.environ.get("MOCK_LONG_VALUE_FILE", None)
mock_long_value = None

if mock_short_value: # pragma: no cover this is just for mocking
    mock_short_value = mock_short_value.encode('utf-8')

if mock_long_value_file: # pragma: no cover this is just for mocking
    f = open(mock_long_value_file, "r")
    mock_long_value = f.read().encode('utf-8')

def _read():
    if mock_short_value:
        return mock_short_value, mock_long_value != None
    
    return CardInterface.read()

def _read_long():
    if mock_long_value:
        return mock_long_value
    
    return CardInterface.read_long()

def _write(content, write_protect=False):
    global mock_short_value
    if mock_short_value:
        mock_short_value = content
        return True

    return CardInterface.write(content, write_protect)

def _write_short_and_long(short_value, long_value):
    return CardInterface.write_short_and_long(short_value, long_value)

@app.route('/card/read')
def card_read():
    card_bytes, long_value_exists = _read()
    if card_bytes is None:
        return json.dumps({"present": False})

    card_data = card_bytes.decode('utf-8')
    if card_data:
        return json.dumps({"present": True, "shortValue": card_data, "longValueExists": long_value_exists})
    else:
        return json.dumps({"present": True})

@app.route('/card/read_long')
def card_read_long():
    long_bytes = _read_long()
    if long_bytes:
        return json.dumps({"longValue": long_bytes.decode('utf-8')})
    else:
        return json.dumps({})

@app.route('/card/write', methods=["POST"])
def card_write():
    content = request.data
    rv = _write(content)
    return json.dumps({"success": rv})

@app.route('/card/write_and_protect', methods=["POST"])
def card_write_and_protect():
    content = request.data
    rv = _write(content, write_protect=True)
    return json.dumps({"success": rv})

@app.route('/card/write_short_and_long', methods=["POST"])
def card_write_short_and_long():
    short_value = request.form['short_value']
    long_value = request.form['long_value']
    rv = _write_short_and_long(short_value.encode('utf-8'), long_value.encode('utf-8'))
    return json.dumps({"success": rv})

@app.route('/card/write_protect_override', methods=["POST"])
def card_write_protect_override():
    CardInterface.override_protection()
    return json.dumps({"success": True})


@app.route('/')
def index_test(): # pragma: no cover this is just for testing
    return send_from_directory(os.path.join(os.path.dirname(os.path.realpath(__file__)), '..'), 'index.html')

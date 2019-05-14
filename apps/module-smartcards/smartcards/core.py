
import json

from flask import Flask, send_from_directory, request

from smartcard.System import readers
from smartcard.util import toHexString, toASCIIBytes, toASCIIString

from .card import CardInterface

app = Flask(__name__)

@app.route('/card/read')
def card_read():
    card_data = (CardInterface.read() or b'').decode('utf-8')
    if card_data:
        return json.dumps({"card": card_data})
    else:
        return json.dumps({})

@app.route('/card/write', methods=["POST"])
def card_write():
    content = request.get_json()
    rv = CardInterface.write(content['code'].encode('utf-8'))
    return json.dumps({"success": rv})


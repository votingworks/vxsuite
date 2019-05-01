
import json

from flask import Flask, send_from_directory, request

from smartcard.System import readers
from smartcard.util import toHexString, toASCIIBytes, toASCIIString

from .card import CardInterface

STATIC_DIR = "../../build"

app = Flask(__name__, static_folder=STATIC_DIR)

@app.route('/card/read')
def card_read():
    card_data = CardInterface.read()
    if card_data:
        return json.dumps({"card": card_data})
    else:
        return json.dumps({})

@app.route('/card/write', methods=["POST"])
def card_write():
    content = request.get_json()
    rv = CardInterface.write(content['code'])
    return json.dumps({"success": rv})

@app.route('/')
def root():
    return app.send_static_file('index.html')

@app.route('/<path:path>')
def send_static(path):
    return send_from_directory(STATIC_DIR, path)


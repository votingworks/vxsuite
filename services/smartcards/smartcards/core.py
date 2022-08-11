
import json
import os
import base64

from flask import Flask, send_from_directory, request

from smartcard.System import readers
from smartcard.util import toHexString, toASCIIBytes, toASCIIString

from .card import CardStatus, VXCardObserver
from .mockcard import MockCard

MockInstance = MockCard().update_from_environ()
RealInstance = VXCardObserver()
CardInterface = MockInstance if MockInstance.has_card else RealInstance

app = Flask(__name__)


@app.route('/card/read')
def card_read():
    status = CardInterface.status()
    # To make things simpler for the client, if we're in the process of reading
    # the card, we'll treat it like there's no card yet.
    if status in [CardStatus.NoCard, CardStatus.Reading]:
        return json.dumps({"status": "no_card"})
    if status == CardStatus.Error:
        return json.dumps({"status": "error"})
    assert status == CardStatus.Ready

    card_bytes, long_value_exists = CardInterface.read()
    assert card_bytes is not None
    try:
        card_data = card_bytes.decode('utf-8')
    except UnicodeDecodeError:  # pragma: no cover - Triggering a UnicodeDecodeError is tricky with our current testing setup
        # If the card data can't be decoded, e.g because the card was removed mid-programming and
        # corrupted as a result, treat it as a blank card so that it can be reprogrammed
        card_data = ''
    if card_data:
        return json.dumps({"status": "ready", "shortValue": card_data, "longValueExists": long_value_exists})
    else:
        return json.dumps({"status": "ready"})


@app.route('/card/read_long')
def card_read_long():
    long_bytes = CardInterface.read_long()
    if long_bytes:
        return json.dumps({"longValue": long_bytes.decode('utf-8')})
    else:
        return json.dumps({})


@app.route('/card/write', methods=["POST"])
def card_write():
    content = request.data
    rv = CardInterface.write(content)
    return json.dumps({"success": rv})


@app.route('/card/write_and_protect', methods=["POST"])
def card_write_and_protect():
    content = request.data
    rv = CardInterface.write(content, write_protect=True)
    return json.dumps({"success": rv})


@app.route('/card/write_short_and_long', methods=["POST"])
def card_write_short_and_long():
    short_value = request.form['short_value']
    long_value = request.form['long_value']
    rv = CardInterface.write_short_and_long(
        short_value.encode('utf-8'), long_value.encode('utf-8'))
    return json.dumps({"success": rv})


@app.route('/card/read_long_b64', methods=["GET"])
def card_read_long_b64():
    long_bytes = CardInterface.read_long()
    if long_bytes:
        return json.dumps({"longValue": base64.b64encode(long_bytes).decode('ascii')})
    else:
        return json.dumps({"longValue": None})


@app.route('/card/write_long_b64', methods=["POST"])
def card_write_long_b64():
    long_value = request.form["long_value"]
    rv = CardInterface.write_long(base64.b64decode(long_value))
    return json.dumps({"success": rv})


@app.route('/card/write_protect_override', methods=["POST"])
def card_write_protect_override():
    CardInterface.override_protection()
    return json.dumps({"success": True})


@app.route('/')
def index_test():  # pragma: no cover this is just for testing
    return send_from_directory(os.path.join(os.path.dirname(os.path.realpath(__file__)), '..'), 'index.html')


@app.route('/main.js')
def index_js_test():  # pragma: no cover this is just for testing
    return send_from_directory(os.path.join(os.path.dirname(os.path.realpath(__file__)), '..'), 'main.js')


@app.route('/mock')
def get_mock():  # pragma: no cover this is just for testing
    if CardInterface == RealInstance:
        return json.dumps({'enabled': False})
    else:
        short_value = MockInstance.short_value
        long_value = MockInstance.long_value

        if short_value is not None:
            short_value = base64.b64encode(short_value).decode('ascii')

        if long_value is not None:
            long_value = base64.b64encode(long_value).decode('ascii')

        return json.dumps({
            'enabled': True,
            'hasCard': MockInstance.has_card,
            'shortValueB64': short_value,
            'longValueB64': long_value,
            'writeProtected': MockInstance.write_protected,
        })


@app.route('/mock', methods=['PUT'])
def update_mock():  # pragma: no cover this is just for testing
    global CardInterface
    content = request.data
    data = json.loads(content)

    # assume mock should be enabled
    if data.get('enabled', True):
        # and that there is a card
        if data.get('hasCard', True):
            # keep the existing values by default
            short_value = MockInstance.short_value
            long_value = MockInstance.long_value
            write_protected = MockInstance.write_protected

            # override values if they are present in the request
            if 'shortValue' in data:
                short_value = data['shortValue']
                if short_value is not None:
                    short_value = bytes(short_value, 'utf-8')

            if 'shortValueB64' in data:
                short_value = data['shortValueB64']
                if short_value is not None:
                    short_value = base64.b64decode(short_value)

            if 'longValue' in data:
                long_value = data['longValue']
                if long_value is not None:
                    long_value = bytes(long_value, 'utf-8')

            if 'longValueB64' in data:
                long_value = data['longValueB64']
                if long_value is not None:
                    long_value = base64.b64decode(long_value)

            if 'writeProtected' in data:
                write_protected = data['writeProtected']

            MockInstance.insert_card(
                short_value,
                long_value,
                write_protected,
                data.get("connectionError", False),
            )
        else:
            MockInstance.remove_card()

        CardInterface = MockInstance
    else:
        CardInterface = RealInstance

    return get_mock()

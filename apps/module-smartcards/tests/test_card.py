
# going to test the consructor
from .mock_card import MockCard
from smartcards.card import VXCardObserver, Card4442, CardAT24C, find_card_by_atr, CARD_TYPES, Card
from smartcard.util import toHexString, toASCIIBytes, toASCIIString

from unittest.mock import patch, MagicMock, Mock

import pytest
import json
import os
import secrets
import hashlib
import gzip

# data on card mocked
CONTENT_BYTES = b'hello1234'
CARD_BYTES = b'VX.'+bytes([0x02])+bytes([0x00]) + \
    bytes([len(CONTENT_BYTES), 0x00, 0x00]) + CONTENT_BYTES

# copy and modify one byte for write-protected
write_protected_card_bytearray = bytearray(CARD_BYTES)
write_protected_card_bytearray[4] = 0x01
WRITE_PROTECTED_CARD_BYTES = bytes(write_protected_card_bytearray)


def flip_bit(data, byte_index: int, bit_index: int):
    byte_with_flipped_bit = data[byte_index] ^ (1 << bit_index)
    return data[0:byte_index] + bytes([byte_with_flipped_bit]) + data[byte_index + 1:]


@patch('smartcard.CardMonitoring.CardMonitor')
def test_constructor(mock_card_monitor):
    vxco = VXCardObserver()


def test_read_no_card():
    vxco = VXCardObserver()
    test_value = vxco.read()
    assert test_value == (None, None)


def test_write_no_card():
    vxco = VXCardObserver()

    rv = vxco.write(CONTENT_BYTES)
    assert rv is False

    rv = vxco.write_long(CONTENT_BYTES)
    assert rv is False


def test_read():
    vxco = VXCardObserver()
    vxco.card = MockCard()

    vxco.card.read_chunk = Mock(return_value=CARD_BYTES)

    # force a read from card, as it is usually cached
    vxco._read_from_card()
    test_value = vxco.read()

    assert test_value == (CONTENT_BYTES, False)
    vxco.card.read_chunk.assert_called_with(0)


def test_read_bad_data_on_card():
    vxco = VXCardObserver()
    vxco.card = MockCard()

    vxco.card.read_chunk = Mock(return_value=b'X' + CARD_BYTES)

    # force a read from card, as it is usually cached
    vxco._read_from_card()
    test_value = vxco.read()

    # since the reading is still returning the bad bytes, this should look like an empty card
    assert test_value == (b'', None)


def test_write():
    vxco = VXCardObserver()
    vxco.card = MockCard()

    vxco.card.write_chunk = Mock()
    vxco.card.read_chunk = Mock(return_value=CARD_BYTES)

    rv = vxco.write(CONTENT_BYTES)

    assert vxco.card.write_enabled

    vxco.card.write_chunk.assert_called_with(0, CARD_BYTES)
    vxco.card.read_chunk.assert_called()
    assert rv


def test_write_card_protected():
    vxco = VXCardObserver()
    vxco.card = MockCard(initial_chunks={0: WRITE_PROTECTED_CARD_BYTES})

    vxco.card.write_chunk = Mock()

    rv = vxco.write(CONTENT_BYTES)
    rv = vxco.write_short_and_long(CONTENT_BYTES, CONTENT_BYTES)

    vxco.card.write_chunk.assert_not_called()

    vxco.override_protection()
    rv = vxco.write(CONTENT_BYTES)
    vxco.card.write_chunk.assert_called()


def test_write_protect_card():
    vxco = VXCardObserver()
    vxco.card = MockCard(initial_chunks={0: CARD_BYTES})

    rv = vxco.write(CONTENT_BYTES, write_protect=True)

    vxco.card.write_chunk = Mock()

    rv = vxco.write(CONTENT_BYTES, write_protect=True)
    vxco.card.write_chunk.assert_not_called()


def test_card_insert_and_remove():
    for test_atr in [card_type.ATR for card_type in CARD_TYPES]:
        vxco = VXCardObserver()
        card_mock = Mock()
        connection_mock = Mock()
        connection_mock.connect = Mock()
        connection_mock.transmit = Mock(return_value=(CARD_BYTES, 0x90, 0x00))
        connection_mock.getATR = Mock(return_value=test_atr)
        card_mock.createConnection = Mock(return_value=connection_mock)

        # this is the callback that's invoked on an inserted card
        vxco.update(None, [[card_mock], []])

        card_mock.createConnection.assert_called()
        connection_mock.transmit.assert_called()

        # remove the card
        vxco.update(None, [[], [card_mock]])
        assert vxco.card is None


def test_find_by_atr():
    result = find_card_by_atr(b'foobar')
    assert result is None


def test_card_write_chunk():
    for card_type in CARD_TYPES:
        connection_mock = Mock()
        connection_mock.transmit = Mock(return_value=([], 0x90, 0x00))
        c = card_type(Mock(), connection_mock)

        assert c.write_chunk(0, CARD_BYTES)
        c.connection.transmit.assert_called()


def test_short_value():
    c = MockCard()
    c.write_short_value(CONTENT_BYTES)
    check = c.read_short_value()

    assert CONTENT_BYTES == check


def test_long_value():
    f = open(os.path.join(os.path.dirname(
        os.path.realpath(__file__)), 'electionSample.json'), "r")
    long_content = f.read()

    c = MockCard()
    vxco = VXCardObserver()

    # before a card is put in
    assert vxco.read_long() is None
    assert not vxco.write_short_and_long(
        CONTENT_BYTES, long_content.encode('utf-8'))

    # now we put in a card
    vxco.card = c
    vxco.write_short_and_long(CONTENT_BYTES, long_content.encode('utf-8'))

    test_short_value, long_value_present = vxco.read()
    assert test_short_value == CONTENT_BYTES
    assert long_value_present

    test_long_value = vxco.read_long().decode('utf-8')
    assert test_long_value == long_content

    random_bytes = secrets.token_bytes(1000)
    vxco.override_protection()
    vxco.write_long(random_bytes)
    assert vxco.read_long() == random_bytes

    # can write another time since write_long should not have overridden bytes
    random_bytes_2 = secrets.token_bytes(1000)
    vxco.write_long(random_bytes_2)
    assert vxco.read_long() == random_bytes_2

    # try clearing the value
    vxco.write_long(b'')
    assert vxco.read_long() == b''


@patch('logging.error')
def test_corrupt_long_value(logging_error):
    c = MockCard()
    long_value = b'a long value'
    c.write_short_and_long_values(CONTENT_BYTES, long_value)

    chunk = c.read_chunk(0)

    # ensure we've got the right part of the chunk
    long_value_hash = chunk[8 + len(CONTENT_BYTES):8 + len(CONTENT_BYTES) + 32]
    assert hashlib.sha256(long_value).digest() == long_value_hash

    # corrupt the long value by flipping a single bit
    corrupted_chunk = flip_bit(chunk, 8 + len(CONTENT_BYTES) + 32, 0)
    c.write_chunk(0, corrupted_chunk)

    assert c.read_long_value() is b''
    logging_error.assert_called_with(
        'mismatched hash while reading long value\nexpected: %s\nfound: %s',
        long_value_hash,
        b'\xef*\xad\xc9\x8f_\x9c\xcdV\xcb\xa5U\xd3f\xa7\xc9\xb0\x9cm\xc2\xc8\xe3\xf4M\xdff\x914=\x9b\xf5A'
    )


def test_short_value_too_long():
    c = MockCard()
    c.write_chunk = Mock()
    short_value = CONTENT_BYTES * 60

    c.write_short_value(short_value)

    c.write_chunk.assert_not_called()


def test_long_value_too_long():
    c = MockCard()
    c.write_chunk = Mock()
    short_value = CONTENT_BYTES
    long_value = bytes(os.urandom(33000))

    c.write_short_and_long_values(short_value, long_value)

    c.write_chunk.assert_not_called()

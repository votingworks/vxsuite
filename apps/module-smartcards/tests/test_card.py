
# going to test the consructor
from smartcards.card import VXCardObserver, Card4442, CardAT24C, find_card_by_atr, CARD_TYPES, Card
from smartcard.util import toHexString, toASCIIBytes, toASCIIString

from unittest.mock import patch, MagicMock, Mock

import pytest, json, os

# data on card mocked
CONTENT_BYTES = b'hello1234'
CARD_BYTES = b'VX.'+bytes([0x00,0x01])+bytes([len(CONTENT_BYTES), 0x00, 0x00]) + CONTENT_BYTES

class MockCard(Card):
    CHUNK_SIZE = 250
    MAX_LENGTH = 32000
    ATR = [0xde,0xad,0xbe,0xef]
    
    def __init__(self):
        super().__init__(None, None)
        self.chunks = {}

    def read_chunk(self, chunk_number):
        if chunk_number in self.chunks:
            return self.chunks[chunk_number]
        else:
            return [0x00] * self.CHUNK_SIZE

    def write_chunk(self, chunk_number, chunk_bytes):
        assert type(chunk_bytes) == bytes
        assert chunk_number <= (self.MAX_LENGTH / self.CHUNK_SIZE)
        self.chunks[chunk_number] = chunk_bytes

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
    
def test_read():
    vxco = VXCardObserver()
    vxco.card = Card4442(Mock(), Mock())

    vxco.card.read_chunk = Mock(return_value=CARD_BYTES)

    # force a read from card, as it is usually cached
    vxco._read_from_card()
    test_value = vxco.read()
    
    assert test_value == (CONTENT_BYTES, False)
    vxco.card.read_chunk.assert_called_with(0)

def test_read_bad_data_on_card():
    vxco = VXCardObserver()
    vxco.card = Card4442(Mock(), Mock())

    vxco.card.read_chunk = Mock(return_value = b'X' + CARD_BYTES)

    # force a read from card, as it is usually cached
    vxco._read_from_card()
    test_value = vxco.read()

    # since the reading is still returning the bad bytes, this should be none
    assert test_value == (None,None)
        
    
def test_write():
    vxco = VXCardObserver()
    vxco.card = Card4442(Mock(), Mock())

    vxco.card.write_chunk = Mock()
    vxco.card.read_chunk = Mock(return_value=CARD_BYTES)
    
    rv = vxco.write(CONTENT_BYTES)

    vxco.card.write_chunk.assert_called_with(0, CARD_BYTES)
    vxco.card.read_chunk.assert_called()
    assert rv

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
        c = card_type(Mock(), Mock())
        c.connection.transmit = Mock(return_value=([], 0x90, 0x00))

        assert c.write_chunk(0, CARD_BYTES)
        c.connection.transmit.assert_called()

def test_short_value():
    c = MockCard()
    c.write_short_value(CONTENT_BYTES)
    check = c.read_short_value()

    assert CONTENT_BYTES == check

def test_long_value():
    f = open(os.path.join(os.path.dirname(os.path.realpath(__file__)), 'electionSample.json'), "r")
    long_content = f.read()

    c = MockCard()
    vxco = VXCardObserver()

    # before a card is put in
    assert vxco.read_long() is None
    assert not vxco.write_short_and_long(CONTENT_BYTES, long_content.encode('utf-8'))

    # now we put in a card
    vxco.card = c
    vxco.write_short_and_long(CONTENT_BYTES, long_content.encode('utf-8'))

    test_short_value, long_value_present = vxco.read()
    assert test_short_value == CONTENT_BYTES
    assert long_value_present

    test_long_value = vxco.read_long().decode('utf-8')
    print(test_long_value[-20:])
    print(long_content[-100:])
    assert test_long_value == long_content

    

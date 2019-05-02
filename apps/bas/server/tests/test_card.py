
# going to test the consructor
from basserver.card import VXCardObserver
from smartcard.util import toHexString, toASCIIBytes, toASCIIString

from unittest.mock import patch, MagicMock, Mock

import pytest, json

TEST_STRING="hello1234"

@patch('smartcard.CardMonitoring.CardMonitor')
def test_constructor(MockCardMonitor):
    vxco = VXCardObserver()
    #assert MockCardMonitor.called

def test_read_no_card():
    vxco = VXCardObserver()
    test_value = vxco.read()
    assert test_value is None

def test_write_no_card():
    vxco = VXCardObserver()
    rv = vxco.write(TEST_STRING)
    assert rv is False
    
def test_read():
    vxco = VXCardObserver()
    vxco.card = Mock()
    vxco.card_value = TEST_STRING
    test_value = vxco.read()
    assert test_value == TEST_STRING
    
def test_write():
    vxco = VXCardObserver()
    vxco.card = Mock()
    vxco.card.connection = Mock()
    vxco.card.connection.transmit = Mock(return_value=(None,None,None))
    vxco._read_bytes = Mock(return_value=toASCIIBytes(TEST_STRING))
    
    rv = vxco.write(TEST_STRING)

    assert rv
    vxco._read_bytes.assert_called()

def test_card_insert_and_remove():
    vxco = VXCardObserver()
    card_mock = Mock()
    connection_mock = Mock()
    connection_mock.connect = Mock()
    connection_mock.transmit = Mock(return_value=(toASCIIBytes(TEST_STRING), 0x90, 0x00))
    card_mock.createConnection = Mock(return_value=connection_mock)

    # this is the callback that's invoked on an inserted card
    vxco.update(None, [[card_mock], []])

    assert card_mock.createConnection.called
    assert connection_mock.transmit.called

    # remove the card
    vxco.update(None, [[], [card_mock]])
    assert vxco.card is None

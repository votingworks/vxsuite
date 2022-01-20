
##
#
# A card holds a short and a long value.
#
# The short value is something like an identifier or a hash. At most 63 bytes.
#
# The long value can be as long as 65,536 bytes, though for now we only support
# the AT24C256 card, which has a total capacity of 32,768 bytes (only about 32,500 bytes
# can be used for the long value.)
#
# The long value is not fetched by default, as that takes a while.
#
# Data Format on a card is:
#
# "VX." - 3 ascii byte identifier
# <version_number> - 1 byte
# <write_protection> - 1 byte
# <short_value_length> - 1 byte
# <long_value_length> - 2 bytes
# <short_value> - up to 63 bytes
# <long_value_hash> - 32 bytes
# <long_value> - up to 16,468 bytes

from enum import Enum
import smartcard.System
from smartcard.CardMonitoring import CardMonitor, CardObserver
from smartcard.ReaderMonitoring import ReaderMonitor, ReaderObserver
from smartcard.util import toHexString, toASCIIBytes, toASCIIString
from smartcard.Exceptions import CardConnectionException
import gzip
import time
import hashlib
import logging

WRITABLE = [0x00]
WRITE_PROTECTED = [0x01]
VERSION = [0x02]

PREFIX_LENGTH = 3
VERSION_LENGTH = 1
WRITE_PROTECTION_LENGTH = 1
SHORT_VALUE_LENGTH_LENGTH = 1
LONG_VALUE_LENGTH_LENGTH = 2
METADATA_LENGTH = PREFIX_LENGTH + VERSION_LENGTH + WRITE_PROTECTION_LENGTH + \
    SHORT_VALUE_LENGTH_LENGTH + LONG_VALUE_LENGTH_LENGTH
LONG_VALUE_HASH_LENGTH = 32


class Card:
    def __init__(self, pyscard_card, pyscard_connection):
        self.card = pyscard_card
        self.connection = pyscard_connection
        self.write_enabled = True
        self.short_value = None
        self.long_value = None
        self.short_value_length = 0
        self.long_value_length = 0
        self.read_metadata()

    def __initial_bytes(self, writable, short_length, long_length):
        initial_bytes = b'VX.' + bytes(VERSION) + bytes(writable)
        initial_bytes += bytes([short_length]) + long_length.to_bytes(2, 'big')
        return initial_bytes

    def _sleep(self, seconds: int):  # pragma: no cover
        time.sleep(seconds)

    # data in bytes
    def _write_raw_data(self, data):
        offset_into_bytes = 0
        chunk_num = 0

        while offset_into_bytes < len(data):
            result = self.write_chunk(
                chunk_num, data[offset_into_bytes:offset_into_bytes+self.CHUNK_SIZE])
            chunk_num += 1
            offset_into_bytes += self.CHUNK_SIZE

    def _read_raw_data(self, read_length):
        return_bytes = b''
        chunk_num = 0

        while len(return_bytes) < read_length:
            return_bytes += bytes(self.read_chunk(chunk_num))
            if return_bytes == b'':
                return return_bytes
            chunk_num += 1

        return return_bytes[:read_length]

    # override the write protection bit. Typically used
    # right before a call to write_short_value or write_short_and_long_values
    def override_protection(self):
        self.write_enabled = True

    def write_short_value(self, short_value_bytes, write_protect=False):
        if not self.write_enabled:
            return

        if len(short_value_bytes) > 250:
            return

        full_bytes = self.__initial_bytes(
            WRITE_PROTECTED if write_protect else WRITABLE, len(short_value_bytes), 0)
        full_bytes += short_value_bytes

        self._write_raw_data(full_bytes)
        self._sleep(1)

    def write_long_value(self, long_value_bytes):
        # For now, do this inefficiently, let's get the APIs right and then we'll optimize.
        self.override_protection()
        return self.write_short_and_long_values(self.short_value, long_value_bytes, WRITABLE)

    def write_short_and_long_values(self, short_value_bytes, long_value_bytes, write_protect=WRITE_PROTECTED):
        if not self.write_enabled:
            return

        long_value = long_value_bytes
        long_value_compressed = gzip.compress(long_value)

        if len(long_value_compressed) < len(long_value):
            long_value = long_value_compressed

        if len(long_value) > self.MAX_LENGTH:
            return

        # by default, we write protect the cards with short-and-long values
        full_bytes = self.__initial_bytes(write_protect, len(
            short_value_bytes), len(long_value))
        full_bytes += short_value_bytes
        digest = hashlib.sha256(long_value).digest()
        full_bytes += digest
        full_bytes += long_value

        self._write_raw_data(full_bytes)

        # wait a little bit
        self._sleep(2)
        self.read_metadata()

    def read_metadata(self):
        metadata = self._read_raw_data(8)

        # the right card by prefix?
        if metadata[:4] != b'VX.' + bytes(VERSION):
            return None

        self.write_enabled = ([metadata[4]] == WRITABLE)
        self.short_value_length = metadata[5]
        self.long_value_length = metadata[6]*256 + metadata[7]

    def read_short_value(self):
        self.read_metadata()
        if self.short_value_length == 0:
            return b''

        length_to_read = METADATA_LENGTH + self.short_value_length
        data = self._read_raw_data(length_to_read)
        self.short_value = data[METADATA_LENGTH:]
        return self.short_value

    def read_long_value(self):
        if self.long_value_length == 0:
            return b''

        start_of_long_value_hash = METADATA_LENGTH + self.short_value_length
        start_of_long_value = start_of_long_value_hash + LONG_VALUE_HASH_LENGTH
        total_expected_length = start_of_long_value + self.long_value_length

        data = self._read_raw_data(total_expected_length)

        expected_long_value_hash = data[start_of_long_value_hash:start_of_long_value]

        raw_content = data[start_of_long_value:total_expected_length]
        actual_long_value_hash = hashlib.sha256(raw_content).digest()

        if actual_long_value_hash != expected_long_value_hash:
            logging.error(
                'mismatched hash while reading long value\nexpected: %s\nfound: %s',
                expected_long_value_hash,
                actual_long_value_hash
            )
            return b''

        try:
            return gzip.decompress(raw_content)
        except:
            return raw_content

    # to implement in subclass
    # returns a bytes structure
    def read_chunk(self, chunk_number):  # pragma: no cover
        pass

    # to implement in subclass
    # expects a bytes structure
    def write_chunk(self, chunk_number, chunk_bytes):  # pragma: no cover
        pass


class Card4442(Card):
    UNLOCK_APDU = [0xFF, 0x20, 0x00, 0x00, 0x02, 0xFF, 0xFF]
    READ_APDU = [0xFF, 0xB0, 0x00]
    WRITE_APDU = [0xFF, 0xD6, 0x00]
    INITIAL_OFFSET = 0x20

    MAX_LENGTH = 250
    CHUNK_SIZE = 250

    # This is the identifier for the card
    ATR = b';\x04\x92#\x10\x91'

    def write_chunk(self, chunk_number, chunk_bytes):
        self.connection.transmit(self.UNLOCK_APDU)

        offset = self.CHUNK_SIZE * chunk_number
        apdu = self.WRITE_APDU + \
            [self.INITIAL_OFFSET + offset,
                len(chunk_bytes)] + list(bytearray(chunk_bytes))
        response, sw1, sw2 = self.connection.transmit(apdu)

        return [sw1, sw2] == [0x90, 0x00]

    def read_chunk(self, chunk_number):
        offset = self.CHUNK_SIZE * chunk_number
        apdu = self.READ_APDU + [self.INITIAL_OFFSET + offset, self.CHUNK_SIZE]
        response, sw1, sw2 = self.connection.transmit(apdu)
        return response


class CardAT24C(Card):
    # This is the identifier for the card
    ATR = b';\x04I2C.'

    # we're using a generic protocol (i2c) which needs metadata about the card
    # card type (1 byte), page size (1byte), address size (1byte), and capacity (4 bytes)
    CARD_IDENTITY = [0x18, 64, 2, 0x00, 0x00, 0x20, 0x00]
    INIT_APDU = [0xFF, 0x30, 0x00, 0x04] + \
        [1 + len(CARD_IDENTITY)] + [0x01] + CARD_IDENTITY

    VERSION = 0x01

    PREFIX = [0xFF, 0x30, 0x00]
    READ_PREFIX = PREFIX + [0x05]
    WRITE_PREFIX = PREFIX + [0x06]
    INITIAL_OFFSET = 0x20

    MAX_LENGTH = 8000
    CHUNK_SIZE = 64

    # This is the identifier for the card
    ATR = b';\x04I2C.'

    def __init__(self, pyscard_card, pyscard_connection):
        super().__init__(pyscard_card, pyscard_connection)
        self.connection.transmit(self.INIT_APDU)

    def compute_offset(self, chunk_number):
        offset = (chunk_number * self.CHUNK_SIZE) + self.INITIAL_OFFSET
        return offset.to_bytes(4, 'big')

    def write_chunk(self, chunk_number, chunk_bytes):
        apdu = self.WRITE_PREFIX + [5 + len(chunk_bytes)] + [self.VERSION]
        apdu += self.compute_offset(chunk_number) + chunk_bytes
        result, sw1, sw2 = self.connection.transmit(apdu)

        return [sw1, sw2] == [0x90, 0x00]

    def read_chunk(self, chunk_number):
        apdu = self.READ_PREFIX + [9] + [self.VERSION]
        apdu += self.compute_offset(chunk_number)
        apdu += self.CHUNK_SIZE.to_bytes(4, 'big')

        result, sw1, sw2 = self.connection.transmit(apdu)
        return result


CARD_TYPES = [Card4442, CardAT24C]


def find_card_by_atr(atr_bytes):
    for card_type in CARD_TYPES:
        if card_type.ATR == atr_bytes:
            return card_type

    return None


class VXReaderObserver(ReaderObserver):
    def __init__(self):
        super(VXReaderObserver, self).__init__()
        self._readers = set()

        readermonitor = ReaderMonitor()
        readermonitor.addObserver(self)

    def update(self, observable, actions):
        (addedreaders, removedreaders) = actions
        for reader in addedreaders:
            self._readers.add(reader)
        for reader in removedreaders:
            self._readers.discard(reader)

    def get_readers(self):
        return list(self._readers)


# We use a singleton because if this is instantiated more than once, specifically in tests,
# we get an error about a readermonitor thread being started twice.
SingletonReaderObserver = VXReaderObserver()


class CardStatus(str, Enum):
    NoCard = "no_card"
    Reading = "reading"
    Ready = "ready"
    Error = "error"


class VXCardObserver(CardObserver):
    def __init__(self):
        self.card = None
        self.card_value = None
        self.card_ready = False
        self.connection_error = None

        cardmonitor = CardMonitor()
        cardmonitor.addObserver(self)

        # keep a handle on this singleton to make testing easier without assuming a singleton
        self.readerobserver = SingletonReaderObserver

    def is_reader_connected(self):
        return len(self.readerobserver.get_readers()) > 0

    def override_protection(self):
        if self.card:
            self.card.override_protection()

    def status(self) -> CardStatus:
        if self.connection_error is not None:
            return CardStatus.Error
        elif self.card_ready:
            return CardStatus.Ready
        elif self.card is not None:
            return CardStatus.Reading
        else:
            return CardStatus.NoCard

    def read(self):
        if self.card and self.card_ready:
            second_value = None
            if self.card_value:
                second_value = self.card.long_value_length > 0
            return self.card_value, second_value
        else:
            return None, None

    def write(self, data, write_protect=False):
        if not (self.card and self.card_ready):
            return False

        self.card.write_short_value(data, write_protect)
        self._read_from_card()

        return self.card_value == data

    def write_long(self, data):
        if not (self.card and self.card_ready):
            return False

        self.card.write_long_value(data)
        return True

    def read_long(self):
        if self.card and self.card_ready:
            return self.card.read_long_value()
        else:
            return None

    def write_short_and_long(self, short_bytes, long_bytes):
        if not (self.card and self.card_ready):
            return False

        self.card.write_short_and_long_values(short_bytes, long_bytes)
        self._read_from_card()

        return self.card_value == short_bytes

    def _read_from_card(self):
        self.card_value = self.card.read_short_value()

    def update(self, observable, actions):
        (addedcards, removedcards) = actions

        if len(addedcards) > 0:
            pyscard_obj = addedcards[0]
            connection = pyscard_obj.createConnection()

            try:
                connection.connect()
                atr_bytes = bytes(connection.getATR())
                card_type = find_card_by_atr(atr_bytes)
                self.card = card_type(pyscard_obj, connection)

                self._read_from_card()
                self.card_ready = True
            # If the card is inserted backwards or is otherwise un-connectable,
            # we'll get a connection error, which we can use to show a hint
            except CardConnectionException as error:
                self.connection_error = error

        if len(removedcards) > 0:
            self.card_ready = False
            self.card_value = None
            self.card = None
            self.connection_error = None

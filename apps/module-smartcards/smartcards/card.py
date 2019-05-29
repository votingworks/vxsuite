
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
# <long_value> - up to 16,500 bytes

from smartcard.CardMonitoring import CardMonitor, CardObserver
from smartcard.util import toHexString, toASCIIBytes, toASCIIString
import gzip

WRITABLE = [0x00]
WRITE_PROTECTED = [0x01]
VERSION = [0x01]

class Card:
    def __init__(self, pyscard_card, pyscard_connection):
        self.card = pyscard_card
        self.connection = pyscard_connection
        self.write_enabled = True
        self.short_value = None
        self.long_value = None
        self.short_value_length = 0
        self.long_value_length = 0
        self.read_raw_first_chunk()

    def __initial_bytes(self, writable, short_length, long_length):
        initial_bytes = b'VX.'+ bytes(VERSION) + bytes(writable)
        initial_bytes += bytes([short_length]) + long_length.to_bytes(2,'big')
        return initial_bytes

    # override the write protection bit. Typically used
    # right before a call to write_short_value or write_short_and_long_values
    def override_protection(self):
        self.write_enabled=True
        
    def write_short_value(self, short_value_bytes, write_protect=False):
        if not self.write_enabled:
            return

        if len(short_value_bytes) > 250:
            return
        
        full_bytes = self.__initial_bytes(WRITE_PROTECTED if write_protect else WRITABLE, len(short_value_bytes), 0)
        full_bytes += short_value_bytes
        self.write_chunk(0, full_bytes)

    def write_short_and_long_values(self, short_value_bytes, long_value_bytes):
        if not self.write_enabled:
            return

        long_value_compressed = gzip.compress(long_value_bytes)

        if len(long_value_compressed) > self.MAX_LENGTH:
            return
        
        # by default, we write protect the cards with short-and-long values
        full_bytes = self.__initial_bytes(WRITE_PROTECTED, len(short_value_bytes), len(long_value_compressed))
        full_bytes += short_value_bytes
        full_bytes += long_value_compressed

        offset_into_bytes = 0
        chunk_num = 0

        while offset_into_bytes < len(full_bytes):
            result = self.write_chunk(chunk_num, full_bytes[offset_into_bytes:offset_into_bytes+self.CHUNK_SIZE])
            chunk_num += 1
            offset_into_bytes += self.CHUNK_SIZE

    def read_raw_first_chunk(self):
        data = self.read_chunk(0)

        # the right card by prefix?
        if bytes(data[:4]) != b'VX.' + bytes(VERSION):
            return None

        self.write_enabled = ([data[4]] == WRITABLE)
        self.short_value_length = data[5]
        self.long_value_length = data[6]*256 + data[7]
        self.short_value = bytes(data[8:8+self.short_value_length])

        return bytes(data)
        
    def read_short_value(self):
        self.read_raw_first_chunk()
        if self.short_value:
            return bytes(self.short_value)
        else:
            return b''

    def read_long_value(self):
        full_bytes = self.read_raw_first_chunk()
        
        total_expected_length = 8 + self.short_value_length + self.long_value_length

        read_so_far = len(full_bytes)
        chunk_num = 1
        while read_so_far < total_expected_length:
            full_bytes += bytes(self.read_chunk(chunk_num))
            read_so_far += self.CHUNK_SIZE
            chunk_num += 1

        compressed_content = full_bytes[8+self.short_value_length:total_expected_length]
        return gzip.decompress(compressed_content)

    # to implement in subclass
    # returns a bytes structure
    def read_chunk(self, chunk_number): # pragma: no cover
        pass

    # to implement in subclass
    # expects a bytes structure
    def write_chunk(self, chunk_number, chunk_bytes): # pragma: no cover
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
        apdu = self.WRITE_APDU + [self.INITIAL_OFFSET + offset, len(chunk_bytes)] + list(bytearray(chunk_bytes))
        response, sw1, sw2 = self.connection.transmit(apdu)

        return [sw1, sw2] == [0x90,0x00]

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
    CARD_IDENTITY = [0x18, 64, 2, 0x00, 0x00, 0x80, 0x00]
    INIT_APDU = [0xFF, 0x30, 0x00, 0x04] + [1 + len(CARD_IDENTITY)] + [0x01] + CARD_IDENTITY

    VERSION = 0x01
    
    PREFIX = [0xFF, 0x30, 0x00]
    READ_PREFIX = PREFIX + [0x05]
    WRITE_PREFIX = PREFIX + [0x06]
    INITIAL_OFFSET = 0x20

    MAX_LENGTH = 8000
    CHUNK_SIZE = 250

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

        return [sw1, sw2] == [0x90,0x00]
        
    def read_chunk(self, chunk_number):
        apdu = self.READ_PREFIX + [9] + [self.VERSION]
        apdu += self.compute_offset(chunk_number)
        apdu += self.CHUNK_SIZE.to_bytes(4,'big')

        result, sw1, sw2 = self.connection.transmit(apdu)
        return result

CARD_TYPES = [Card4442, CardAT24C]

def find_card_by_atr(atr_bytes):
    for card_type in CARD_TYPES:
        if card_type.ATR == atr_bytes:
            return card_type

    return None

class VXCardObserver(CardObserver):
    def __init__(self):
        self.card = None
        self.card_value = None
        self.card_type = None

        cardmonitor = CardMonitor()
        cardmonitor.addObserver(self)

    def override_protection(self):
        if self.card:
            self.card.override_protection()
            
    def read(self):
        if self.card:
            second_value = None
            if self.card_value:
                second_value = self.card.long_value_length > 0
            return self.card_value, second_value
        else:
            return None, None

    def write(self, data, write_protect=False):
        if not self.card:
            return False

        self.card.write_short_value(data, write_protect)
        self._read_from_card()

        return self.card_value == data

    def read_long(self):
        if self.card:
            return self.card.read_long_value()
        else:
            return None

    def write_short_and_long(self, short_bytes, long_bytes):
        if not self.card:
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
            connection.connect()
            
            atr_bytes = bytes(connection.getATR())
            card_type = find_card_by_atr(atr_bytes)
            self.card = card_type(pyscard_obj, connection)
            
            self._read_from_card()

        if len(removedcards) > 0:
            self.card = None

CardInterface = VXCardObserver()

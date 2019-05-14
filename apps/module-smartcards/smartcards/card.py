
##
#
# A card holds a short and a long value.
#
# The short value is something like an identifier or a hash. At most 63 bytes.
#
# The long value can be as long as 16,500 bytes, though for now we only support the AT24C64 card,
# which has a total capacity of 8,192 bytes (only about 8,000 bytes can be used for the long value.)
#
# The long value is not fetched by default, as that takes a while.
# 
# Data Format on a card is:
#
# "VX." - 3 ascii byte identifier
# <version_number> - 2 bytes
# <short_value_length> - 1 byte
# <long_value_length> - 2 bytes
# <short_value> - up to 63 bytes
# <long_value> - up to 16,500 bytes

from smartcard.CardMonitoring import CardMonitor, CardObserver
from smartcard.util import toHexString, toASCIIBytes, toASCIIString
from time import sleep

VERSION = [0x00, 0x01]

class Card:
    def __init__(self, pyscard_card, pyscard_connection):
        self.card = pyscard_card
        self.connection = pyscard_connection
        self.short_value = None
        self.long_value = None

    def write_short_value(self, short_value_bytes):
        full_bytes = b'VX.'+ bytes(VERSION)
        full_bytes += bytes([len(short_value_bytes)])
        full_bytes += bytes([0,0])
        full_bytes += short_value_bytes
        self.write_chunk(0, full_bytes)

# uncomment once implemented with tests
#    def write_short_and_long_values(self, short_value_bytes, long_value_bytes):
#        pass

    def read_short_value(self):
        data = self.read_chunk(0)

        # the right card by prefix?
        if bytes(data[:5]) != b'VX.' + bytes(VERSION):
            return None

        self.short_value_length = data[5]
        self.long_value_length = data[6]*256 + data[7]

        self.short_value = data[8:8+self.short_value_length]
        return self.short_value

# uncomment once implemented with tests
#    def read_long_value(self):
#        pass

    # to implement in subclass
    def read_chunk(self, chunk_number): # pragma: no cover
        pass

    # to implement in subclass
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

class CardAT24C64(Card):
    # This is the identifier for the card
    ATR = b';\x04I2C.'

    # we're using a generic protocol (i2c) which needs metadata about the card
    # card type (1 byte), page size (1byte), address size (1byte), and capacity (4 bytes)
    CARD_IDENTITY = [0x14, 32, 2, 0x00, 0x00, 0x20, 0x00]
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

CARD_TYPES = [Card4442, CardAT24C64]

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

    def read(self):
        if self.card:
            return self.card_value
        else:
            return None

    def write(self, data):
        if not self.card:
            return False

        self.card.write_short_value(data)
        self._read_from_card()

        return self.card_value == data

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

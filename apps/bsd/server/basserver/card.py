
from smartcard.CardMonitoring import CardMonitor, CardObserver
from smartcard.util import toHexString, toASCIIBytes, toASCIIString

UNLOCK_APDU = [0xFF, 0x20, 0x00, 0x00, 0x02, 0xFF, 0xFF]
READ_APDU = [0xFF, 0xB0, 0x00]
WRITE_APDU = [0xFF, 0xD6, 0x00]
INITIAL_OFFSET = 0x20

class VXCardObserver(CardObserver):
    def __init__(self):
        self.card = None
        self.card_value = None

        cardmonitor = CardMonitor()
        cardmonitor.addObserver(self)

    def read(self):
        if self.card:
            return self.card_value
        else:
            return None

    def write(self, s):
        if not self.card:
            return False
        
        self._write_value(s)
        self._read_value()

        return self.card_value == s

    def _read_bytes(self, offset, length):
        apdu = READ_APDU + [INITIAL_OFFSET + offset, length]
        response, sw1, sw2 = self.card.connection.transmit(apdu)

        # check sw1,sw2
        return response

    def _unlock(self):
        self.card.connection.transmit(UNLOCK_APDU)
        
    def _write_bytes(self, offset, length, byte_array):
        apdu = WRITE_APDU + [INITIAL_OFFSET + offset, length] + byte_array
        response, sw1, sw2 = self.card.connection.transmit(apdu)
    
    def _read_value(self):
        length = self._read_bytes(0, 1)
        return_bytes = self._read_bytes(1, length[0])
        self.card_value = toASCIIString(return_bytes)

    def _write_value(self, s):
        self._unlock()
        self._write_bytes(0, 1, [len(s)])
        self._write_bytes(1, len(s), toASCIIBytes(s))
    
    def update(self, observable, actions):
        (addedcards, removedcards) = actions

        if len(addedcards) > 0:
            self.card = addedcards[0]
            self.card.connection = self.card.createConnection()
            self.card.connection.connect()
            self._read_value()

        if len(removedcards) > 0:
            self.card = None

CardInterface = VXCardObserver()

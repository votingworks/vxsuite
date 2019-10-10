
from smartcards.card import Card


class MockCard(Card):
    CHUNK_SIZE = 250
    MAX_LENGTH = 32000
    ATR = [0xde, 0xad, 0xbe, 0xef]

    def __init__(self, initial_chunks=None):
        self.chunks = initial_chunks or {}
        super().__init__(None, None)

    def _sleep(self, seconds):
        pass

    def read_chunk(self, chunk_number):
        if chunk_number in self.chunks:
            chunk = self.chunks[chunk_number]

            # if the chunk is too short, add a bunch of bogus values at the end
            while len(chunk) < self.CHUNK_SIZE:
                chunk += b'V'
            return chunk
        else:
            return [0x00] * self.CHUNK_SIZE

    def write_chunk(self, chunk_number, chunk_bytes):
        assert type(chunk_bytes) == bytes
        assert chunk_number <= (self.MAX_LENGTH / self.CHUNK_SIZE)
        self.chunks[chunk_number] = chunk_bytes

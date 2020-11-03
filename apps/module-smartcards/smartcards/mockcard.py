import os


class MockCard:  # pragma: no cover this is just for mocking
    def __init__(self, short_value=None, long_value=None, write_protected=False):
        if short_value is not None or long_value is not None:
            self.insert_card(short_value, long_value, write_protected)
        else:
            self.remove_card()

    def is_reader_connected(self):
        return True
    
    def override_protection(self):
        if not self.has_card:
            return
        self.write_protected = False

    def read(self):
        if self.has_card:
            return self.short_value, self.long_value is not None
        else:
            return None, None

    def write(self, data, write_protect=False):
        if not self.has_card or self.write_protected:
            return False

        self.short_value = data
        if write_protect:
            self.write_protected = True
        return True

    def read_long(self):
        if self.has_card:
            return self.long_value
        else:
            return None

    def write_long(self, data):
        if not self.has_card or self.write_protected:
            return False

        self.long_value = data
        return True

    def write_short_and_long(self, short_bytes, long_bytes):
        if not self.has_card or self.write_protected:
            return False

        self.short_value = short_bytes
        self.long_value = long_bytes

        return True

    def insert_card(self, short_value=None, long_value=None, write_protected=False):
        self.has_card = True
        self.short_value = short_value
        self.long_value = long_value
        self.write_protected = write_protected
        return self

    def remove_card(self):
        self.has_card = False
        self.short_value = None
        self.long_value = None
        self.write_protected = False
        return self

    def update_from_environ(self):
        if os.environ.get("MOCK_SHORT_VALUE", None):
            self.has_card = True
            self.write_protected = False

            mock_short_value = os.environ.get("MOCK_SHORT_VALUE", None)
            mock_long_value_file = os.environ.get("MOCK_LONG_VALUE_FILE", None)
            mock_long_value = None

            if mock_short_value:
                mock_short_value = mock_short_value.encode('utf-8')

            if mock_long_value_file:
                f = open(mock_long_value_file, "r")
                mock_long_value = f.read().encode('utf-8')

            self.write_short_and_long(mock_short_value, mock_long_value)

        return self

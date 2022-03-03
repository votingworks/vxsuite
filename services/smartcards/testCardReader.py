import re
import json
import hashlib
import secrets
import time
import sys
from smartcards.card import VXCardObserver
import smartcard

REFRESH_INTERVAL = 0.2

observer = VXCardObserver()


def wait_for_reader():
    if not observer.is_reader_connected():
        print("Insert card reader")
    while not observer.is_reader_connected():
        time.sleep(REFRESH_INTERVAL)
    print("Card reader connected")


def wait_for_card():
    if not observer.card:
        print("Insert card")
    while not (observer.card and observer.card_ready):
        time.sleep(REFRESH_INTERVAL)
    print("Card inserted")
    if not observer.card.write_enabled:
        observer.override_protection()
        print("Overrode write protection")


def wait_for_disconnect():
    print("Disconnect card reader")
    # Disconnect card so the reader can be unplugged safely
    del observer.card
    while observer.is_reader_connected():
        time.sleep(REFRESH_INTERVAL)
    print("Card reader disconnected")


def check_equal_bytes(wrote, read, label):
    if wrote != read:
        print(f"{label} mismatch")
        print("Wrote: ", wrote)
        print("Read : ", read)
        print("\u274C Test failed")
        sys.exit(1)


def test_card():
    print("Clearing card")
    observer.write(b"{}")
    check_equal_bytes(b"{}", observer.read()[0], "Short value")
    check_equal_bytes(b"", observer.read_long(), "Long value")

    print("Testing random bytes")
    short_bytes = secrets.token_bytes(61)
    long_bytes = secrets.token_bytes(3500)

    observer.write(short_bytes)
    observer.write_long(long_bytes)
    check_equal_bytes(short_bytes, observer.read()[0], "Short value")
    check_equal_bytes(long_bytes, observer.read_long(), "Long value")

    print("Testing admin card")
    with open("fixtures/admin/long.json", "r") as long_file:
        long = json.loads(long_file.read())
        del long["seal"]
        long_bytes = json.dumps(long).encode('utf-8')
    with open("fixtures/admin/short.json", "r") as short_file:
        short_bytes = re.sub(
            r"{{hash\(long\)}}",
            hashlib.sha256(long_bytes).hexdigest(),
            short_file.read()
        ).encode('utf-8')

    observer.write(short_bytes)
    observer.write_long(long_bytes)

    check_equal_bytes(short_bytes, observer.read()[0], "Short value")
    check_equal_bytes(long_bytes, observer.read_long(), "Long value")

    print("\u2705 Test passed")


if __name__ == "__main__":
    time.sleep(1)  # Wait for initial card reader detection
    while True:
        try:
            wait_for_reader()
            wait_for_card()
            test_card()
            wait_for_disconnect()
            print()
        except KeyboardInterrupt:
            sys.exit(0)

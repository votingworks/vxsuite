
import json, hashlib
from smartcards.core import CardInterface

import time
time.sleep(2)

def print_bytes(b: bytes):
    try:
        s = b.decode('utf-8')
        if s.isprintable():
            print(s)
        else:
            print(s.__str__())
    except:
        print(b)

short_value, has_long_value = CardInterface.read()
print_bytes(short_value)

if has_long_value:
    print("reading long value...")
    long_value = CardInterface.read_long()
    print_bytes(long_value)

print("done")

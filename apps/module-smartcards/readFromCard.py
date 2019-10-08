
import json, hashlib
from smartcards.core import CardInterface

import time
time.sleep(2)

short_value, has_long_value = CardInterface.read()
print(short_value.decode('utf-8'))

if has_long_value:
    print("reading long value...")
    long_value = CardInterface.read_long()
    print(long_value.decode('utf-8'))

print("done")

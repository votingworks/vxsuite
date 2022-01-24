
import json
import hashlib
from smartcards.core import CardInterface

import time
time.sleep(2)

short_value = json.dumps(
    {'t': 'voter', 'pr': '23', 'bs': '12', 'c': 1643066962})

CardInterface.override_protection()
CardInterface.write(short_value.encode('utf-8'))

print("done")

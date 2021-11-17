
import json, hashlib
from smartcards.core import CardInterface

import time
time.sleep(2)

short_value = json.dumps({})

CardInterface.override_protection()
CardInterface.write(short_value.encode('utf-8'))

print("done")


import json, hashlib
from smartcards.card import CardInterface

import time
time.sleep(2)

short_value = json.dumps({'t':'voter', 'pr': '23', 'bs': '12'})

print(CardInterface.card)
CardInterface.write(short_value.encode('utf-8'))

print("done")

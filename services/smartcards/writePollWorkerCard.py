
import json, hashlib, sys
from smartcards.core import CardInterface

# wait for the reader to wake up and notice the card
import time
time.sleep(2)

f = open(sys.argv[1], "rb")
election_bytes = f.read()
f.close()

short_value = json.dumps({'t':'pollworker', 'h': hashlib.sha256(election_bytes).hexdigest()})

print(CardInterface.card)
CardInterface.override_protection()
CardInterface.write(short_value.encode('utf-8'))

print("done")

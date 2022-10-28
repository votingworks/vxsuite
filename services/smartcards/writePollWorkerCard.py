
import json
import hashlib
import sys
from smartcards.core import CardInterface

# wait for the reader to wake up and notice the card
import time
time.sleep(2)

f = open(sys.argv[1], "rb")
election_bytes = f.read()
f.close()

# Poll worker cards use long values to store precinct scanner tally reports.
# Script takes optional second argument of a file path to a .json card tally.
long_value = None
if len(sys.argv) > 2:
    f = open(sys.argv[2], "rb")
    long_value = f.read()
    f.close()


short_value = json.dumps({
    't': 'poll_worker',
    'h': hashlib.sha256(election_bytes).hexdigest(),
})

print(CardInterface.card)
CardInterface.override_protection()
if long_value:
    CardInterface.write_short_and_long(short_value.encode('utf-8'), long_value)
else:
    CardInterface.write(short_value.encode('utf-8'))

print("done")

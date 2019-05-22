
import json, hashlib, sys
from smartcards.card import CardInterface

# wait for the reader to wake up and notice the card
import time
time.sleep(2)

f = open(sys.argv[1])
election = json.loads(f.read())
f.close()

election_json_bytes = json.dumps(election).encode('utf-8')
short_value = json.dumps({'t':'clerk', 'h': hashlib.sha256(election_json_bytes).hexdigest()})

print(CardInterface.card)
CardInterface.write_short_and_long(short_value.encode('utf-8'), election_json_bytes)

print("done")

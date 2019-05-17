
import json, hashlib
from smartcards.card import CardInterface

import time
time.sleep(2)

f = open("./tests/electionSample.json")
election = json.loads(f.read())
f.close()

election_json_bytes = json.dumps(election).encode('utf-8')
short_value = json.dumps({'t':'admin', 'h': hashlib.sha256(election_json_bytes).hexdigest()})

print(CardInterface.card)
CardInterface.write_short_and_long(short_value.encode('utf-8'), election_json_bytes)

print("done")

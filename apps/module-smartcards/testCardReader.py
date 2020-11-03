
import json, hashlib, secrets, time, sys
from smartcards.core import CardInterface

# generate random bytes for short value and long value
short_bytes = secrets.token_bytes(30)
long_bytes = secrets.token_bytes(50)

# get the card reader and card in the reader to register
time.sleep(2)

if not CardInterface.card:
    print("no card?")
    sys.exit(0)

CardInterface.write(short_bytes)
CardInterface.write_long(long_bytes)

is_working = True

return_short = CardInterface.read()[0]
if return_short != short_bytes:
    print("short value mismatch")
    print("wrote: ", short_bytes)
    print("read : ", return_short)
    is_working = False

return_long = CardInterface.read_long()
if return_long != long_bytes:
    print("long value mismatch")
    print("wrote: ", long_bytes)
    print("read : ", return_long)
    is_working = False

if is_working:
    print("reader is working")

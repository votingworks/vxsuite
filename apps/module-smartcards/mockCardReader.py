#!/usr/bin/env python3

import http.client
import json
import sys
import os
import re
import time
from typing import Optional


def fatal(error):
    print('error: %s' % error, file=sys.stderr)
    usage(file=sys.stderr, code=-1)


def usage(file=sys.stdout, code=0):
    argv0 = sys.argv[0]

    print('usage: %s COMMAND [OPTIONS]' % argv0, file=file)
    print('', file=file)
    print('# enable mock reader but without a card', file=file)
    print('%s enable --no-card' % argv0, file=file)
    print('', file=file)
    print('# enable mock reader with a card but do not set long/short values', file=file)
    print('%s enable' % argv0, file=file)
    print('', file=file)
    print('# enable mock reader with a card and set long/short values from fixture data', file=file)
    print('%s enable --fixture DIR' % argv0, file=file)
    print('', file=file)
    print('# disable mock reader / use the real card reader', file=file)
    print('%s disable' % argv0, file=file)
    exit(code)


def set_mock(request_data):
    client = http.client.HTTPConnection('localhost', 3001)
    client.request('PUT', '/mock', json.dumps(request_data))
    response = client.getresponse()

    print(response.read().decode('utf-8'))


def enable(card: bool, fixture_path: Optional[str]):
    if card and fixture_path is not None:
        enable_fixture(fixture_path)
    else:
        set_mock({'enabled': True, 'hasCard': card})


def enable_fixture(fixture_path: str):
    if os.path.isfile(fixture_path):
        fatal('You provided a file for FIXTURE instead of a directory: %s.' %
              fixture_path)
        exit(-1)

    fixture_short_path = os.path.join(fixture_path, 'short.json')
    fixture_long_path_json = os.path.join(fixture_path, 'long.json')
    fixture_long_path_b64 = os.path.join(fixture_path, 'long.b64')

    if not os.path.exists(fixture_short_path):
        fatal('Expected a short value at %s.' % fixture_short_path)

    request_data = {
        'enabled': True,
    }

    with open(fixture_short_path, 'r') as short_file:
        request_data['shortValue'] = re.sub(r"\"{{now}}\"", str(
            round(time.time())), short_file.read())

    if os.path.exists(fixture_long_path_json):
        with open(fixture_long_path_json, 'r') as long_file:
            request_data['longValue'] = long_file.read()
    elif os.path.exists(fixture_long_path_b64):
        with open(fixture_long_path_b64, 'r') as long_file:
            request_data['longValueB64'] = long_file.read()
    else:
        request_data['longValue'] = None

    set_mock(request_data)


def disable():
    set_mock({'enabled': False})


if len(sys.argv) < 2:
    usage(file=sys.stderr, code=-1)

command = sys.argv[1]

if command == 'enable':
    card = True
    fixture_path = None

    i = 2
    while i < len(sys.argv):
        arg = sys.argv[i]

        if arg == '--card' or arg == '--no-card':
            card = arg == '--card'
        elif arg == '--fixture':
            i += 1
            fixture_path = sys.argv[i]
        else:
            fatal('unexpected option: %s' % arg)

        i += 1

    enable(card, fixture_path)
elif command == 'disable':
    disable()
elif command == 'help':
    usage()
else:
    fatal('unknown command: %s' % command)
